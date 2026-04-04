import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: driverRecord } = await supabase
    .from("drivers")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (!driverRecord || !["admin", "manager"].includes(driverRecord.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { month } = await req.json();
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [year, m] = month.split("-").map(Number);
  const firstDay = `${year}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(year, m, 0);
  const lastDayStr = `${year}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const monthLabel = new Date(year, m - 1).toLocaleDateString("en-MY", { year: "numeric", month: "long" });

  // Get drivers with wages in this month
  const { data: orders } = await admin
    .from("orders")
    .select("driver_id, wages, allowance_liters, allowance_unit_price, special_allowance, transport")
    .gte("order_date", firstDay)
    .lte("order_date", lastDayStr)
    .in("status", ["approved", "delivered"])
    .not("driver_id", "is", null);

  // Sum wages per driver
  const driverWages = new Map<string, number>();
  for (const o of orders ?? []) {
    const allowanceTotal = (o.allowance_liters ?? 0) * (o.allowance_unit_price ?? 0) + (o.special_allowance ?? 0);
    const total = (o.wages ?? 0) + allowanceTotal + (o.transport ?? 0);
    if (total > 0) {
      driverWages.set(o.driver_id, (driverWages.get(o.driver_id) ?? 0) + total);
    }
  }

  // Get driver details
  const driverIds = Array.from(driverWages.keys());
  if (driverIds.length === 0) {
    return NextResponse.json({ sent: 0, message: "No drivers with wages this month" });
  }

  const { data: drivers } = await admin
    .from("drivers")
    .select("id, name, phone")
    .in("id", driverIds);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tko-ops-hub.vercel.app";
  let sentCount = 0;

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
      `🔗 Link: ${appUrl}/driver/wages?month=${month}`,
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

    sentCount++;
  }

  return NextResponse.json({ sent: sentCount });
}
