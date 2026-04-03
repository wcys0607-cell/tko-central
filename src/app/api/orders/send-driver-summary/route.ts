import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("drivers")
    .select("id, name, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile || !["admin", "manager", "office"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { driver_id, date } = await request.json();
  if (!driver_id || !date) {
    return NextResponse.json(
      { error: "driver_id and date are required" },
      { status: 400 }
    );
  }

  // Fetch driver
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("id", driver_id)
    .single();

  if (!driver)
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  if (!driver.phone)
    return NextResponse.json(
      { error: `${driver.name} has no phone number` },
      { status: 422 }
    );

  // Fetch all orders for this driver on this date (excluding cancelled/rejected)
  const { data: orders } = await supabase
    .from("orders")
    .select(
      `
      id, order_date, destination, quantity_liters,
      customer:customer_id(id, name, short_name),
      items:order_items(product_id, quantity_liters, product:product_id(name))
    `
    )
    .eq("driver_id", driver_id)
    .eq("order_date", date)
    .not("status", "in", '("cancelled","rejected")')
    .order("created_at");

  if (!orders || orders.length === 0) {
    return NextResponse.json(
      { error: "No orders found for this driver on this date" },
      { status: 404 }
    );
  }

  // Format date as DD/MM/YYYY
  const [y, m, d] = date.split("-");
  const formattedDate = `${d}/${m}/${y}`;

  // Build summary lines
  const lines = orders.map((o: Record<string, unknown>) => {
    const cust = o.customer as {
      name: string;
      short_name?: string | null;
    } | null;
    const customerName = cust?.short_name || cust?.name || "—";

    // Get diesel/LT quantity from items
    const items = (o.items ?? []) as unknown as {
      product_id: string;
      quantity_liters: number;
      product: { name: string } | null;
    }[];
    const dieselItem = items.find((i) =>
      (i.product?.name ?? "").toUpperCase().includes("DIESEL")
    );
    const ltItem = items.find((i) =>
      (i.product?.name ?? "").toUpperCase().includes("(LT)")
    );
    const qty =
      dieselItem?.quantity_liters ??
      ltItem?.quantity_liters ??
      o.quantity_liters;
    const qtyStr = qty ? `${Number(qty).toLocaleString()}L` : "—";

    // Shorten destination: take first line, trim to something readable
    const dest = String(o.destination ?? "—").split("\n")[0].trim();
    const shortDest = dest.length > 40 ? dest.slice(0, 40) + "…" : dest;

    return `${customerName}, ${qtyStr}, ${shortDest}`;
  });

  const message = [`📋 *${formattedDate}*`, ``, ...lines].join("\n");

  const result = await sendWhatsApp({
    phone: driver.phone,
    message,
    referenceId: `summary-${driver_id}-${date}`,
    type: "driver_daily_summary",
    recipientName: driver.name,
    sender: "driver",
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to send" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    orderCount: orders.length,
    message,
  });
}
