import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetch } from "./client";

interface BukkuInvoice {
  id: number;
  number?: string;
  status?: string;
  amount?: number;
  balance?: number;
  date?: string;
  term_items?: { date: string; amount: number; balance: number }[];
  payments?: { number?: string; date?: string; amount?: number }[];
}

interface InvoiceSyncResult {
  updated: number;
  overdue: number;
  failed: number;
  errors: string[];
}

/** Pull payment status from Bukku for all orders that have bukku_invoice_id */
export async function syncInvoiceStatus(): Promise<InvoiceSyncResult> {
  const config = await getBukkuConfig();
  if (!config) {
    return { updated: 0, overdue: 0, failed: 0, errors: ["Bukku not configured"] };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all orders with bukku_invoice_id
  const { data: orders } = await supabase
    .from("orders")
    .select("id, bukku_invoice_id, customer_id, invoice_number, receipt_no")
    .not("bukku_invoice_id", "is", null);

  if (!orders || orders.length === 0) {
    return { updated: 0, overdue: 0, failed: 0, errors: [] };
  }

  const result: InvoiceSyncResult = { updated: 0, overdue: 0, failed: 0, errors: [] };
  const today = new Date();

  for (const order of orders) {
    const res = await bukkuFetch<{ transaction: BukkuInvoice }>(config, {
      path: `/sales/invoices/${order.bukku_invoice_id}`,
    });

    if (!res.ok) {
      result.failed++;
      result.errors.push(`Invoice ${order.bukku_invoice_id}: ${res.error}`);
      continue;
    }

    // Bukku returns single invoice as { transaction: {...} }
    const invoice = res.data?.transaction;
    if (!invoice) {
      result.failed++;
      continue;
    }

    // Determine payment status
    let paymentStatus: string;
    const balanceDue = invoice.balance ?? invoice.amount ?? 0;
    const total = invoice.amount ?? 0;

    if (balanceDue <= 0) {
      paymentStatus = "paid";
    } else if (balanceDue < total) {
      paymentStatus = "partial";
    } else {
      // Check if overdue — due date from term_items or invoice date
      const dueDateStr = invoice.term_items?.[0]?.date ?? invoice.date;
      const dueDate = dueDateStr ? new Date(dueDateStr) : null;
      if (dueDate && dueDate < today) {
        paymentStatus = "overdue";
        result.overdue++;
      } else {
        paymentStatus = "unpaid";
      }
    }

    // Build update payload — sync invoice number and receipt number from Bukku
    const updatePayload: Record<string, unknown> = { bukku_payment_status: paymentStatus };

    // Sync invoice number if finalized (has a number and not draft)
    if (invoice.number && invoice.status !== "draft" && !order.invoice_number) {
      updatePayload.invoice_number = invoice.number;
    }

    // Sync receipt number from payments
    if (invoice.payments && invoice.payments.length > 0 && !order.receipt_no) {
      const receiptNos = invoice.payments.map((p) => p.number).filter(Boolean).join(", ");
      if (receiptNos) updatePayload.receipt_no = receiptNos;
    }

    await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id);

    result.updated++;
  }

  return result;
}

interface PushResult {
  ok: boolean;
  bukkuId?: number;
  bukkuNumber?: string;
  error?: string;
}

type PushType = "sales_order" | "delivery_order";

/** Build line items from an order (shared by SO and DO push) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildLineItems(orderId: string, order: Record<string, unknown>, supabase: any) {
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("*, product:product_id(id,name,bukku_product_id,sst_rate)")
    .eq("order_id", orderId)
    .order("sort_order");

  const items = (orderItems ?? []) as { product_id: string | null; quantity_liters: number; unit_price: number; sst_rate: number; product: { id: string; name: string; bukku_product_id: number | null; sst_rate: number | null } | null }[];

  if (items.length > 0) {
    const unlinked = items.filter((i) => !i.product?.bukku_product_id);
    if (unlinked.length > 0) {
      return { error: `Product "${unlinked[0].product?.name ?? "unknown"}" not linked to Bukku` };
    }
    return {
      lineItems: items.map((i) => ({
        product_id: i.product!.bukku_product_id!,
        description: `${i.product!.name} delivery to ${(order.destination as string) || ""}`.trim(),
        quantity: i.quantity_liters ?? 0,
        unit_price: i.unit_price ?? 0,
        tax_rate: i.sst_rate ?? 0,
      })),
    };
  }

  // Fallback: legacy single-product
  const product = order.product as { name: string; bukku_product_id: number | null; sst_rate: number | null } | null;
  if (!product?.bukku_product_id) {
    return { error: `Product "${product?.name}" not linked to Bukku` };
  }
  return {
    lineItems: [{
      product_id: product.bukku_product_id,
      description: `${product.name} delivery to ${(order.destination as string) || ""}`.trim(),
      quantity: (order.quantity_liters as number) ?? 0,
      unit_price: (order.unit_price as number) ?? 0,
      tax_rate: product.sst_rate ?? 0,
    }],
  };
}

/** Push order to Bukku as Sales Order or Delivery Order */
export async function pushToBukku(orderId: string, pushType: PushType): Promise<PushResult> {
  const config = await getBukkuConfig();
  if (!config) return { ok: false, error: "Bukku not configured" };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: order } = await supabase
    .from("orders")
    .select("*, customer:customers!orders_customer_id_fkey(*), product:products!orders_product_id_fkey(*)")
    .eq("id", orderId)
    .single();

  if (!order) return { ok: false, error: "Order not found" };

  // Check if already pushed
  if (pushType === "sales_order" && order.bukku_so_id) {
    return { ok: false, error: "Sales Order already pushed to Bukku" };
  }
  if (pushType === "delivery_order" && order.bukku_do_id) {
    return { ok: false, error: "Delivery Order already pushed to Bukku" };
  }

  if (!order.customer?.bukku_contact_id) {
    await supabase.from("orders").update({ bukku_sync_status: "error" }).eq("id", orderId);
    return { ok: false, error: `Customer "${order.customer?.name}" not linked to Bukku` };
  }

  const result = await buildLineItems(orderId, order, supabase);
  if (result.error) {
    await supabase.from("orders").update({ bukku_sync_status: "error" }).eq("id", orderId);
    return { ok: false, error: result.error };
  }

  const orderDate = new Date(order.order_date);
  const paymentTerms = order.customer?.payment_terms ?? 30;
  const dueDate = new Date(orderDate);
  dueDate.setDate(dueDate.getDate() + paymentTerms);

  const payload = {
    contact_id: order.customer.bukku_contact_id,
    date: order.order_date,
    due_date: dueDate.toISOString().split("T")[0],
    line_items: result.lineItems,
  };

  // Bukku API endpoints
  const endpointMap: Record<PushType, string> = {
    sales_order: "/sales/orders",
    delivery_order: "/sales/delivery_notes",
  };

  const res = await bukkuFetch<{ transaction: { id: number; number?: string } }>(config, {
    method: "POST",
    path: endpointMap[pushType],
    body: payload,
  });

  if (!res.ok) {
    await supabase.from("orders").update({ bukku_sync_status: "error" }).eq("id", orderId);
    return { ok: false, error: res.error };
  }

  const bukkuId = res.data?.transaction?.id;
  const bukkuNumber = res.data?.transaction?.number;
  if (!bukkuId) return { ok: false, error: "No ID returned from Bukku" };

  // Update order with Bukku IDs
  const updatePayload: Record<string, unknown> = { bukku_sync_status: "synced" };
  if (pushType === "sales_order") {
    updatePayload.bukku_so_id = bukkuId;
  } else {
    updatePayload.bukku_do_id = bukkuId;
    // Auto-fill DN number from Bukku Delivery Order number
    if (bukkuNumber) updatePayload.dn_number = bukkuNumber;
  }

  await supabase.from("orders").update(updatePayload).eq("id", orderId);

  return { ok: true, bukkuId, bukkuNumber };
}
