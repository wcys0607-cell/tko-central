import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushToBukku } from "@/lib/bukku/invoices";
import { sendWhatsApp } from "@/lib/whatsapp";
import { createClient as createAdmin } from "@supabase/supabase-js";

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

  if (result.ok) {
    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order } = await admin
      .from("orders")
      .select("total_sale, customer_id")
      .eq("id", orderId)
      .single();

    if (order) {
      let customerName = "Unknown";
      if (order.customer_id) {
        const { data: cust } = await admin
          .from("customers")
          .select("name")
          .eq("id", order.customer_id)
          .single();
        if (cust) customerName = cust.name;
      }

      const typeLabel = pushType === "sales_order" ? "Sales Order" : "Delivery Order";

      const { data: configs } = await admin
        .from("app_config")
        .select("key, value")
        .eq("key", "ADMIN_PHONE");

      const adminPhone = configs?.[0]?.value;
      if (adminPhone) {
        await sendWhatsApp({
          phone: adminPhone,
          message: `📝 *Draft ${typeLabel} Pushed to Bukku*\nCustomer: ${customerName}\nAmount: RM ${(order.total_sale ?? 0).toFixed(2)}\n${result.bukkuNumber ? `Number: ${result.bukkuNumber}\n` : ""}Please review in Bukku.`,
          type: "bukku_invoice_created",
          recipientName: "Admin",
          referenceId: orderId,
        });
      }
    }
  }

  return NextResponse.json(result);
}
