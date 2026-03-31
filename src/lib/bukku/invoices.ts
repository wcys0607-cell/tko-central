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
    .select("id, bukku_invoice_id, customer_id")
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

    await supabase
      .from("orders")
      .update({ bukku_payment_status: paymentStatus })
      .eq("id", order.id);

    result.updated++;
  }

  return result;
}

interface CreateInvoiceResult {
  ok: boolean;
  bukkuInvoiceId?: number;
  error?: string;
}

/** Create a Bukku invoice from an approved order */
export async function createBukkuInvoice(orderId: string): Promise<CreateInvoiceResult> {
  const config = await getBukkuConfig();
  if (!config) {
    return { ok: false, error: "Bukku not configured" };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Load order with customer and product
  const { data: order } = await supabase
    .from("orders")
    .select("*, customer:customers!orders_customer_id_fkey(*), product:products!orders_product_id_fkey(*)")
    .eq("id", orderId)
    .single();

  if (!order) return { ok: false, error: "Order not found" };
  if (order.bukku_invoice_id) return { ok: false, error: "Invoice already created in Bukku" };

  // Verify customer has Bukku contact ID
  if (!order.customer?.bukku_contact_id) {
    await supabase
      .from("orders")
      .update({ bukku_sync_status: "error" })
      .eq("id", orderId);
    return { ok: false, error: `Customer "${order.customer?.name}" not linked to Bukku` };
  }

  // Verify product has Bukku product ID
  if (!order.product?.bukku_product_id) {
    await supabase
      .from("orders")
      .update({ bukku_sync_status: "error" })
      .eq("id", orderId);
    return { ok: false, error: `Product "${order.product?.name}" not linked to Bukku` };
  }

  // Calculate due date
  const orderDate = new Date(order.order_date);
  const paymentTerms = order.customer?.payment_terms ?? 30;
  const dueDate = new Date(orderDate);
  dueDate.setDate(dueDate.getDate() + paymentTerms);

  // Build invoice payload
  const payload = {
    contact_id: order.customer.bukku_contact_id,
    date: order.order_date,
    due_date: dueDate.toISOString().split("T")[0],
    reference: order.dn_number || order.invoice_number || null,
    line_items: [
      {
        product_id: order.product.bukku_product_id,
        description: `${order.product.name} delivery to ${order.destination || ""}`.trim(),
        quantity: order.quantity_liters ?? 0,
        unit_price: order.unit_price ?? 0,
        tax_rate: order.product.sst_rate ?? 0,
      },
    ],
  };

  const res = await bukkuFetch<{ transaction: { id: number; number?: string } }>(config, {
    method: "POST",
    path: "/sales/invoices",
    body: payload,
  });

  if (!res.ok) {
    await supabase
      .from("orders")
      .update({ bukku_sync_status: "error" })
      .eq("id", orderId);
    return { ok: false, error: res.error };
  }

  const invoiceId = res.data?.transaction?.id;
  if (!invoiceId) {
    return { ok: false, error: "No invoice ID returned" };
  }

  // Update order with Bukku invoice ID
  await supabase
    .from("orders")
    .update({
      bukku_invoice_id: invoiceId,
      bukku_sync_status: "synced",
    })
    .eq("id", orderId);

  return { ok: true, bukkuInvoiceId: invoiceId };
}
