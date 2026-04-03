import { createClient } from "@/lib/supabase/server";

type SenderType = "default" | "driver";

interface SendWhatsAppOptions {
  phone: string;
  message: string;
  referenceId?: string;
  type?: string;
  recipientName?: string;
  /** Which OnSend sender to use. Defaults to "default". */
  sender?: SenderType;
}

/** Map sender type to config key for sender number */
const SENDER_CONFIG_KEY: Record<SenderType, string> = {
  default: "ONSEND_DEFAULT_SENDER",
  driver: "ONSEND_DRIVER_SENDER",
};

export async function sendWhatsApp({
  phone,
  message,
  referenceId,
  type = "general",
  recipientName,
  sender = "default",
}: SendWhatsAppOptions): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Fetch all OnSend config
  const { data: configs } = await supabase
    .from("app_config")
    .select("key, value")
    .like("key", "ONSEND_%");

  const cfg: Record<string, string> = {};
  for (const row of configs ?? []) {
    if (row.key && row.value) cfg[row.key] = row.value;
  }

  // Determine which sender number to use (1 or 2)
  const senderNum = cfg[SENDER_CONFIG_KEY[sender]] ?? cfg["ONSEND_DEFAULT_SENDER"] ?? "1";
  const token = cfg[`ONSEND_${senderNum}_TOKEN`];
  const appId = cfg[`ONSEND_${senderNum}_APP_ID`]; // only account 2 uses app_id

  if (!token) {
    await logNotification(supabase, { type, phone, recipientName, message, referenceId, status: "failed" });
    return { success: false, error: `OnSend sender ${senderNum} not configured (missing token)` };
  }

  try {
    const cleanPhone = phone.replace(/[+ ]/g, "").trim();

    // Build payload — account 2 uses app_id + body, account 1 uses type: "text"
    const payload: Record<string, string> = {
      phone_number: cleanPhone,
      message,
    };
    if (appId) {
      payload.app_id = appId;
      payload.body = message;
    } else {
      payload.type = "text";
    }

    const res = await fetch("https://onsend.io/api/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
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
  orderDate?: string;
  itemLines?: string;
  deliveryRemark?: string;
}

function formatOrderBody(p: OrderNotifyParams): string {
  const dest = p.destination.split("\n")[0].trim();
  const lines = [
    ``,
    `📅 Date: ${p.orderDate ?? "—"}`,
    `👤 Customer: ${p.customerName}`,
    `📍 Destination: ${dest}`,
    ``,
    `📦 Qty: ${p.quantityLiters.toLocaleString()}L`,
  ];
  if (p.itemLines) {
    lines.pop(); // remove simple qty line
    lines.push(`📦 Items:`);
    lines.push(p.itemLines);
  }
  lines.push(``);
  lines.push(`👷 Created by: ${p.creatorName}`);
  if (p.deliveryRemark) lines.push(`📝 Remark: ${p.deliveryRemark}`);
  return lines.join("\n");
}

export function buildUrgentTodayMessage(p: OrderNotifyParams): string {
  return `🚨 *URGENT: TODAY Order*` + formatOrderBody(p);
}

export function buildLateEntryMessage(p: OrderNotifyParams): string {
  return `⚠️ *LATE ENTRY: Tomorrow Order*` + formatOrderBody(p);
}

export function buildWeekendMessage(p: OrderNotifyParams): string {
  return `⚠️ *WEEKEND: Monday Order*` + formatOrderBody(p);
}

export function buildBigOrderMessage(p: OrderNotifyParams): string {
  return `📦 *BIG ORDER: Stock Preparation*` + formatOrderBody(p);
}

export function buildRejectedMessage(p: OrderNotifyParams): string {
  return `❌ *ORDER REJECTED*\nManager has rejected your entry.` + formatOrderBody(p);
}
