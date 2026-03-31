import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find locations below threshold
  const { data: lowLocations } = await supabase
    .from("stock_locations")
    .select("id, code, name, current_balance, low_threshold")
    .not("low_threshold", "is", null)
    .gt("low_threshold", 0);

  const alerts = (lowLocations ?? []).filter(
    (l) => (l.current_balance ?? 0) < (l.low_threshold ?? 0)
  );

  if (alerts.length === 0) {
    return NextResponse.json({ message: "No low stock locations", alerts: 0 });
  }

  // Check which alerts were already sent today
  const today = new Date().toISOString().split("T")[0];
  const { data: sentToday } = await supabase
    .from("notifications_log")
    .select("reference_id")
    .eq("type", "low_stock")
    .gte("sent_at", `${today}T00:00:00`)
    .lte("sent_at", `${today}T23:59:59`);

  const sentIds = new Set((sentToday ?? []).map((n) => n.reference_id));

  // Get phone numbers from app_config
  const { data: configs } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["ADMIN_PHONE", "MANAGER_PHONE"]);

  const configMap: Record<string, string> = {};
  for (const row of configs ?? []) {
    if (row.key && row.value) configMap[row.key] = row.value;
  }

  const adminPhone = configMap["ADMIN_PHONE"];
  const managerPhone = configMap["MANAGER_PHONE"];
  const recipients: { phone: string; name: string }[] = [];
  if (adminPhone) recipients.push({ phone: adminPhone, name: "Admin" });
  if (managerPhone) recipients.push({ phone: managerPhone, name: "Manager" });

  let sentCount = 0;

  for (const loc of alerts) {
    if (sentIds.has(loc.id)) continue;

    const message = [
      `🛢️ *LOW STOCK ALERT*`,
      `Location: ${loc.name || loc.code}`,
      `Balance: ${(loc.current_balance ?? 0).toLocaleString()}L`,
      `Threshold: ${(loc.low_threshold ?? 0).toLocaleString()}L`,
      `Please arrange refill.`,
    ].join("\n");

    for (const r of recipients) {
      await sendWhatsApp({
        phone: r.phone,
        message,
        type: "low_stock",
        recipientName: r.name,
        referenceId: loc.id,
      });
    }

    sentCount++;
  }

  return NextResponse.json({
    message: `Checked ${alerts.length} low locations, sent ${sentCount} new alerts`,
    alerts: sentCount,
  });
}
