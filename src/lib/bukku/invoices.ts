import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetch, bukkuFetchPdf, type BukkuConfig } from "./client";

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
interface BukkuProductDetails {
  accountId: number | null;
  taxCodeId: number | null;
  unitId: number | null;
}

/** Fetch product details from Bukku (account_id, tax_code_id, unit_id) */
async function getBukkuProductDetails(config: BukkuConfig, bukkuProductId: number): Promise<BukkuProductDetails> {
  const res = await bukkuFetch<{ product: Record<string, unknown> }>(config, {
    path: `/products/${bukkuProductId}`,
  });
  if (!res.ok || !res.data?.product) return { accountId: null, taxCodeId: null, unitId: null };
  const p = res.data.product;
  return {
    accountId: (p.sale_account_id ?? p.account_id ?? null) as number | null,
    taxCodeId: (p.sale_tax_code_id ?? p.tax_code_id ?? null) as number | null,
    unitId: (p.unit_id ?? p.product_unit_id ?? null) as number | null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildLineItems(orderId: string, order: Record<string, unknown>, supabase: any, config: BukkuConfig) {
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

    // Fetch account_id and tax_id for each unique Bukku product
    const uniqueBukkuIds = [...new Set(items.map((i) => i.product!.bukku_product_id!))];
    const detailsMap = new Map<number, BukkuProductDetails>();
    for (const bid of uniqueBukkuIds) {
      detailsMap.set(bid, await getBukkuProductDetails(config, bid));
    }

    return {
      lineItems: items.map((i) => {
        const details = detailsMap.get(i.product!.bukku_product_id!) ?? { accountId: null, taxCodeId: null, unitId: null };
        const item: Record<string, unknown> = {
          product_id: i.product!.bukku_product_id!,
          account_id: details.accountId,
          description: i.product!.name,
          quantity: i.quantity_liters ?? 0,
          unit_price: i.unit_price ?? 0,
        };
        if (details.taxCodeId) item.tax_code_id = details.taxCodeId;
        if (details.unitId) item.product_unit_id = details.unitId;
        return item;
      }),
    };
  }

  // Fallback: legacy single-product
  const product = order.product as { name: string; bukku_product_id: number | null; sst_rate: number | null } | null;
  if (!product?.bukku_product_id) {
    return { error: `Product "${product?.name}" not linked to Bukku` };
  }
  const details = await getBukkuProductDetails(config, product.bukku_product_id);
  const legacyItem: Record<string, unknown> = {
    product_id: product.bukku_product_id,
    account_id: details.accountId,
    description: product.name,
    quantity: (order.quantity_liters as number) ?? 0,
    unit_price: (order.unit_price as number) ?? 0,
  };
  if (details.taxCodeId) legacyItem.tax_code_id = details.taxCodeId;
  if (details.unitId) legacyItem.product_unit_id = details.unitId;
  return { lineItems: [legacyItem] };
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

  // Determine if this is a create or update
  const existingBukkuId = pushType === "sales_order" ? order.bukku_so_id : order.bukku_do_id;
  const isUpdate = !!existingBukkuId;

  if (!order.customer?.bukku_contact_id) {
    await supabase.from("orders").update({ bukku_sync_status: "error" }).eq("id", orderId);
    return { ok: false, error: `Customer "${order.customer?.name}" not linked to Bukku` };
  }

  const result = await buildLineItems(orderId, order, supabase, config);
  if (result.error) {
    await supabase.from("orders").update({ bukku_sync_status: "error" }).eq("id", orderId);
    return { ok: false, error: result.error };
  }

  const orderDate = new Date(order.order_date);
  const paymentTerms = order.customer?.payment_terms ?? 30;
  const dueDate = new Date(orderDate);
  dueDate.setDate(dueDate.getDate() + paymentTerms);

  // Fetch billing & shipping address from Bukku contact (pre-formatted plain text)
  let billingParty: string | null = null;
  let shippingParty: string | null = null;
  const contactRes = await bukkuFetch<{ contact: { billing_party?: string; shipping_party?: string } }>(config, {
    path: `/contacts/${order.customer.bukku_contact_id}`,
  });
  if (contactRes.ok && contactRes.data?.contact) {
    billingParty = contactRes.data.contact.billing_party || null;
    shippingParty = contactRes.data.contact.shipping_party || null;
  }

  // Fallback shipping to system destination if Bukku contact has no shipping address
  if (!shippingParty) {
    shippingParty = order.destination || null;
  }

  const payload: Record<string, unknown> = {
    contact_id: order.customer.bukku_contact_id,
    date: order.order_date,
    due_date: dueDate.toISOString().split("T")[0],
    currency_code: "MYR",
    exchange_rate: 1,
    tax_mode: "exclusive",
    status: "ready",
    form_items: result.lineItems,
  };
  if (billingParty) payload.billing_party = billingParty;
  if (shippingParty) {
    payload.shipping_party = shippingParty;
    payload.show_shipping = true;
  }

  // Bukku API endpoints
  const endpointMap: Record<PushType, string> = {
    sales_order: "/sales/orders",
    delivery_order: "/sales/delivery_orders",
  };

  const method = isUpdate ? "PUT" : "POST";
  const path = isUpdate
    ? `${endpointMap[pushType]}/${existingBukkuId}`
    : endpointMap[pushType];

  let res = await bukkuFetch<{ transaction: { id: number; number?: string } }>(config, {
    method,
    path,
    body: payload,
  });

  // If Bukku blocks due to inventory check, create as draft first then update to ready
  if (!res.ok && res.error?.includes("INVENTORY_CHECK") && !isUpdate) {
    payload.status = "draft";
    res = await bukkuFetch<{ transaction: { id: number; number?: string } }>(config, {
      method: "POST",
      path,
      body: payload,
    });

    // If draft created successfully, update it to ready
    if (res.ok && res.data?.transaction?.id) {
      const draftId = res.data.transaction.id;
      payload.status = "ready";
      const updateRes = await bukkuFetch<{ transaction: { id: number; number?: string } }>(config, {
        method: "PUT",
        path: `${path}/${draftId}`,
        body: payload,
      });
      // If update to ready fails (inventory check again), keep as draft — clerk can finalize
      if (updateRes.ok) {
        res = updateRes;
      }
      // else res still has the draft data, which is fine
    }
  }

  if (!res.ok) {
    await supabase.from("orders").update({ bukku_sync_status: "error" }).eq("id", orderId);
    return { ok: false, error: res.error };
  }

  const bukkuId = res.data?.transaction?.id ?? existingBukkuId;
  const bukkuNumber = res.data?.transaction?.number;
  if (!bukkuId) return { ok: false, error: "No ID returned from Bukku" };

  // Update order with Bukku IDs
  const updatePayload: Record<string, unknown> = { bukku_sync_status: "synced" };
  if (pushType === "sales_order") {
    updatePayload.bukku_so_id = bukkuId;
    if (bukkuNumber) updatePayload.bukku_so_number = bukkuNumber;

    // Fetch SO details for short_link
    const soDetail = await bukkuFetch<{ transaction: { short_link?: string } }>(config, {
      path: `/sales/orders/${bukkuId}`,
    });
    if (soDetail.ok && soDetail.data?.transaction?.short_link) {
      updatePayload.bukku_short_link = soDetail.data.transaction.short_link;
    }

    // Fetch and store the PDF in Supabase Storage
    const pdfRes = await bukkuFetchPdf(config, `/sales/orders/${bukkuId}/pdf`);
    if (pdfRes.ok && pdfRes.data) {
      const fileName = `so/${orderId}/${bukkuNumber || bukkuId}.pdf`;
      await supabase.storage
        .from("bukku-docs")
        .upload(fileName, pdfRes.data, {
          contentType: "application/pdf",
          upsert: true,
        });
    }
  } else {
    updatePayload.bukku_do_id = bukkuId;
    // Auto-fill DN number from Bukku Delivery Order number
    if (bukkuNumber) updatePayload.dn_number = bukkuNumber;
  }

  await supabase.from("orders").update(updatePayload).eq("id", orderId);

  return { ok: true, bukkuId, bukkuNumber };
}
