import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("drivers")
    .select("id, name, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile || !["admin", "manager", "office"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch order with joins
  const { data: order } = await supabase
    .from("orders")
    .select(`
      *,
      customer:customer_id(id, name, short_name),
      driver:driver_id(id, name, phone),
      items:order_items(product_id, quantity_liters, product:product_id(name, unit))
    `)
    .eq("id", id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const driver = order.driver as { name: string; phone?: string } | null;
  if (!driver?.phone) {
    return NextResponse.json({ error: "Driver has no phone number" }, { status: 422 });
  }

  const customer = order.customer as { name: string; short_name?: string } | null;
  const customerName = customer?.short_name || customer?.name || "—";
  const date = order.order_date || "—";

  // Build items text
  const items = (order.items ?? []) as { product_id: string; quantity_liters: number; product: { name: string; unit?: string } | null }[];
  const itemLines = items.map((i) => {
    const name = i.product?.name ?? "—";
    const unit = i.product?.unit ?? "L";
    return `  - ${name}: ${i.quantity_liters?.toLocaleString() ?? 0} ${unit}`;
  }).join("\n");

  const message = [
    `🚛 *Delivery Order*`,
    ``,
    `📅 Date: ${date}`,
    `👤 Customer: ${customerName}`,
    `📍 Destination: ${order.destination || "—"}`,
    ``,
    `📦 Items:`,
    itemLines || "  —",
    ``,
    `👨‍✈️ Driver: ${driver.name}`,
    order.delivery_remark ? `\n📝 Remark: ${order.delivery_remark}` : "",
  ].filter(Boolean).join("\n");

  const result = await sendWhatsApp({
    phone: driver.phone,
    message,
    referenceId: id,
    type: "delivery_to_driver",
    recipientName: driver.name,
    sender: "driver",
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to send" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
