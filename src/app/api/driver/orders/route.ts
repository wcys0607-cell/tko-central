import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  // Authenticate the user
  const { user, error, status } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error }, { status: status ?? 401 });
  }

  const driverId = req.nextUrl.searchParams.get("driver_id");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!driverId || !from || !to) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  // Drivers can only fetch their own orders
  if (user.role === "driver" && user.id !== driverId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data, error: dbError } = await supabase
    .from("orders")
    .select(
      `*, customer:customers!orders_customer_id_fkey(id, name, short_name),
       items:order_items(product_id, quantity_liters, product:product_id(name))`
    )
    .eq("driver_id", driverId)
    .in("status", ["approved", "delivered"])
    .gte("order_date", from)
    .lte("order_date", to)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: true });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** Check if driver_remark is editable for a given order date */
function isRemarkEditable(orderDate: string): boolean {
  const now = new Date();
  const oDate = new Date(orderDate + "T00:00:00");
  const orderMonth = oDate.getMonth();
  const orderYear = oDate.getFullYear();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Same month → always editable
  if (orderYear === currentYear && orderMonth === currentMonth) return true;

  // Previous month → check grace period
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  if (orderYear === prevYear && orderMonth === prevMonth) {
    const lastDayOfOrderMonth = new Date(orderYear, orderMonth + 1, 0).getDate();
    const orderDay = oDate.getDate();
    // Last 2 days of the month, and today is still ≤ 2nd of current month
    if (orderDay >= lastDayOfOrderMonth - 1 && now.getDate() <= 2) {
      return true;
    }
  }

  return false;
}

export async function PATCH(req: NextRequest) {
  const { user, error, status } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error }, { status: status ?? 401 });
  }

  const body = await req.json();
  const { order_id, driver_remark } = body as { order_id?: string; driver_remark?: string };

  if (!order_id) {
    return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the order to verify ownership and check date
  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("id, driver_id, order_date")
    .eq("id", order_id)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Drivers can only update their own orders
  if (user.role === "driver" && order.driver_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check editable window
  if (!isRemarkEditable(order.order_date)) {
    return NextResponse.json({ error: "Editing period has ended for this order" }, { status: 403 });
  }

  // Update only driver_remark
  const { data: updated, error: updateErr } = await supabase
    .from("orders")
    .update({ driver_remark: driver_remark ?? null })
    .eq("id", order_id)
    .select("id, driver_remark")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
