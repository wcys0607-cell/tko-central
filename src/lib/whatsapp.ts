import { createClient } from "@/lib/supabase/server";

interface SendWhatsAppOptions {
  phone: string;
  message: string;
  referenceId?: string;
  type?: string;
  recipientName?: string;
}

export async function sendWhatsApp({
  phone,
  message,
  referenceId,
  type = "general",
  recipientName,
}: SendWhatsAppOptions): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Fetch config from app_config
  const { data: configs } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["ONSEND_API_TOKEN", "ONSEND_INSTANCE_ID"]);

  const configMap: Record<string, string> = {};
  for (const row of configs ?? []) {
    if (row.key && row.value) configMap[row.key] = row.value;
  }

  const token = configMap["ONSEND_API_TOKEN"];
  const instanceId = configMap["ONSEND_INSTANCE_ID"];

  if (!token || !instanceId) {
    await logNotification(supabase, { type, phone, recipientName, message, referenceId, status: "failed" });
    return { success: false, error: "ONSEND_API_TOKEN or ONSEND_INSTANCE_ID not configured" };
  }

  try {
    const res = await fetch("https://onsend.io/api/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        instance_id: instanceId,
        to: phone,
        message,
      }),
    });

    const ok = res.ok;
    await logNotification(supabase, {
      type,
      phone,
      recipientName,
      message,
      referenceId,
      status: ok ? "sent" : "failed",
    });

    if (!ok) {
      const errText = await res.text();
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await logNotification(supabase, { type, phone, recipientName, message, referenceId, status: "failed" });
    return { success: false, error: errMsg };
  }
}

async function logNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: {
    type: string;
    phone: string;
    recipientName?: string;
    message: string;
    referenceId?: string;
    status: "sent" | "failed";
  }
) {
  await supabase.from("notifications_log").insert({
    type: opts.type,
    recipient_phone: opts.phone,
    recipient_name: opts.recipientName ?? null,
    message: opts.message,
    reference_id: opts.referenceId ?? null,
    status: opts.status,
    sent_at: new Date().toISOString(),
  });
}

// ── Order notification helpers ──────────────────────────────────────────────

interface OrderNotifyParams {
  orderId: string;
  customerName: string;
  destination: string;
  quantityLiters: number;
  creatorName: string;
  managerPhone: string;
  creatorPhone?: string;
}

export function buildUrgentTodayMessage(p: OrderNotifyParams): string {
  return `🚨 *URGENT: TODAY Order*\nFrom: ${p.creatorName}\nCustomer: ${p.customerName}\nQty: ${p.quantityLiters.toLocaleString()}L\nDest: ${p.destination}`;
}

export function buildLateEntryMessage(p: OrderNotifyParams): string {
  return `⚠️ *LATE ENTRY: Tomorrow Order*\nFrom: ${p.creatorName}\nCustomer: ${p.customerName}\nQty: ${p.quantityLiters.toLocaleString()}L\nDest: ${p.destination}`;
}

export function buildWeekendMessage(p: OrderNotifyParams): string {
  return `⚠️ *WEEKEND: Monday Order*\nFrom: ${p.creatorName}\nCustomer: ${p.customerName}\nQty: ${p.quantityLiters.toLocaleString()}L\nDest: ${p.destination}`;
}

export function buildBigOrderMessage(p: OrderNotifyParams): string {
  return `📦 *BIG ORDER: Stock Preparation*\nFrom: ${p.creatorName}\nCustomer: ${p.customerName}\nQty: ${p.quantityLiters.toLocaleString()}L\nDest: ${p.destination}`;
}

export function buildRejectedMessage(p: OrderNotifyParams): string {
  return `❌ *ORDER REJECTED*\nManager has rejected your entry.\nCustomer: ${p.customerName}\nQty: ${p.quantityLiters.toLocaleString()}L\nDest: ${p.destination}`;
}
