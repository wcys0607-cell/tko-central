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

  // Get overdue orders (bukku_payment_status = 'overdue')
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_date, invoice_number, total_sale, customer_id")
    .eq("bukku_payment_status", "overdue")
    .not("bukku_invoice_id", "is", null);

  if (!orders || orders.length === 0) {
    return NextResponse.json({ message: "No overdue invoices", alerts: 0 });
  }

  const today = new Date();
  let alertCount = 0;

  // Get admin phone
  const { data: configs } = await supabase
    .from("app_config")
    .select("key, value")
    .eq("key", "ADMIN_PHONE");
  const adminPhone = configs?.[0]?.value;

  if (!adminPhone) {
    return NextResponse.json({ message: "ADMIN_PHONE not configured", alerts: 0 });
  }

  for (const order of orders) {
    const orderDate = new Date(order.order_date);
    const daysOverdue = Math.floor(
      (today.getTime() - orderDate.getTime()) / 86400000
    );

    // Only alert for invoices overdue > 30 days
    if (daysOverdue <= 30) continue;

    // Check notifications_log to avoid duplicate alerts (max 1 per week per invoice)
    const oneWeekAgo = new Date(today.getTime() - 7 * 86400000).toISOString();
    const { data: recentAlerts } = await supabase
      .from("notifications_log")
      .select("id")
      .eq("type", "overdue_invoice")
      .eq("reference_id", order.id)
      .gte("sent_at", oneWeekAgo)
      .limit(1);

    if (recentAlerts && recentAlerts.length > 0) continue;

    // Get customer name
    let customerName = "Unknown";
    if (order.customer_id) {
      const { data: cust } = await supabase
        .from("customers")
        .select("name")
        .eq("id", order.customer_id)
        .single();
      if (cust) customerName = cust.name;
    }

    const message = [
      `💰 *OVERDUE INVOICE ALERT*`,
      `Customer: ${customerName}`,
      `Invoice: ${order.invoice_number || "N/A"}`,
      `Amount: RM ${(order.total_sale ?? 0).toFixed(2)}`,
      `Overdue by: ${daysOverdue} days`,
      `Please follow up on payment.`,
    ].join("\n");

    await sendWhatsApp({
      phone: adminPhone,
      message,
      type: "overdue_invoice",
      recipientName: "Admin",
      referenceId: order.id,
    });

    alertCount++;
  }

  return NextResponse.json({
    message: `Checked ${orders.length} overdue invoices, sent ${alertCount} alerts`,
    alerts: alertCount,
  });
}
