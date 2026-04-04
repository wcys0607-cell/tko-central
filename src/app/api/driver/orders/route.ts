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
    .eq("status", "approved")
    .gte("order_date", from)
    .lte("order_date", to)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: true });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
