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

  // Determine previous month
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prevMonth.getFullYear();
  const m = prevMonth.getMonth() + 1;
  const monthStr = `${year}-${String(m).padStart(2, "0")}`;
  const firstDay = `${monthStr}-01`;
  const lastDay = new Date(year, m, 0);
  const lastDayStr = `${monthStr}-${String(lastDay.getDate()).padStart(2, "0")}`;
  const monthLabel = prevMonth.toLocaleDateString("en-MY", { year: "numeric", month: "long" });

  // Get driver wage data
  const { data: orders } = await supabase
    .from("orders")
    .select("driver_id, wages, allowance, transport, middle_man_id, order_type")
    .gte("order_date", firstDay)
    .lte("order_date", lastDayStr)
    .in("status", ["approved", "delivered"]);

  // Count drivers with wages
  const driverWages = new Map<string, number>();
  const agents = new Set<string>();
  let smartstreamCount = 0;

  for (const o of orders ?? []) {
    if (o.driver_id) {
      const total = (o.wages ?? 0) + (o.allowance ?? 0) + (o.transport ?? 0);
      if (total > 0) driverWages.set(o.driver_id, (driverWages.get(o.driver_id) ?? 0) + total);
    }
    if (o.order_type === "agent" && o.middle_man_id) agents.add(o.middle_man_id);
  }

  // Count SmartStream orders
  const { count: ssCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("order_date", firstDay)
    .lte("order_date", lastDayStr)
    .in("status", ["approved", "delivered"])
    .ilike("customer.name", "%SMART STREAM%");

  smartstreamCount = ssCount ?? 0;

  // Send WhatsApp to each driver with wages
  const driverIds = Array.from(driverWages.keys());
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .in("id", driverIds);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tko-ops-hub.vercel.app";
  let driversSent = 0;

  for (const driver of drivers ?? []) {
    if (!driver.phone) continue;

    const message = [
      `🚗 *Top Kim Oil - Wages Update* 🚗`,
      ``,
      `Hello ${driver.name},`,
      `Please check your wages statement for ${monthLabel}.`,
      `Sila semak penyata gaji anda untuk bulan ${monthLabel}.`,
      `请检查您的 ${monthLabel} 工资单。`,
      ``,
      `🔗 Link: ${appUrl}/driver/wages?month=${monthStr}`,
      ``,
      `(Login to view / Sila log masuk untuk melihat)`,
    ].join("\n");

    await sendWhatsApp({
      phone: driver.phone,
      message,
      type: "wages_statement",
      recipientName: driver.name,
      referenceId: driver.id,
    });
    driversSent++;
  }

  // Send summary to Admin
  const { data: configs } = await supabase
    .from("app_config")
    .select("key, value")
    .eq("key", "ADMIN_PHONE");
  const adminPhone = configs?.[0]?.value;

  if (adminPhone) {
    const summary = [
      `📊 *Monthly Reports Ready*`,
      `Month: ${monthLabel}`,
      `Drivers: ${driversSent} statements sent`,
      `Agents: ${agents.size} commission reports`,
      `SmartStream: ${smartstreamCount} orders`,
      `View at: ${appUrl}/reports`,
    ].join("\n");

    await sendWhatsApp({
      phone: adminPhone,
      message: summary,
      type: "monthly_report_summary",
      recipientName: "Admin",
    });
  }

  // Log
  await supabase.from("notifications_log").insert({
    type: "monthly_report_generation",
    message: `${monthLabel}: ${driversSent} driver statements, ${agents.size} agents, ${smartstreamCount} SmartStream`,
    status: "sent",
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json({
    month: monthStr,
    drivers_sent: driversSent,
    agents: agents.size,
    smartstream: smartstreamCount,
  });
}
