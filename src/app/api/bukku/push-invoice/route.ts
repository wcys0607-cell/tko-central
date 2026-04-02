import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushToBukku } from "@/lib/bukku/invoices";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: driver } = await supabase
    .from("drivers")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (!driver || !["admin", "manager", "office"].includes(driver.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId, pushType } = await req.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
  if (!pushType || !["sales_order", "delivery_order"].includes(pushType)) {
    return NextResponse.json({ error: "pushType must be 'sales_order' or 'delivery_order'" }, { status: 400 });
  }

  const result = await pushToBukku(orderId, pushType);
  return NextResponse.json(result);
}
