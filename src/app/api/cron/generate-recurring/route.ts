import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function POST(request: Request) {
  // Verify cron secret — always required
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const today = new Date();
  const todayName = DAY_NAMES[today.getDay()];

  // Get active rules for today
  const { data: rules, error: rulesErr } = await supabase
    .from("recurring_rules")
    .select("*, customer:customer_id(id,name)")
    .eq("trigger_day", todayName)
    .eq("is_active", true);

  if (rulesErr) {
    return NextResponse.json({ error: rulesErr.message }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ message: `No recurring rules for ${todayName}`, created: 0 });
  }

  // Find admin user for created_by
  const { data: adminDriver } = await supabase
    .from("drivers")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .single();

  const created: string[] = [];
  const errors: string[] = [];

  for (const rule of rules) {
    // Use Malaysia timezone (UTC+8) for date
    const nowMY = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
    const deliveryDate = new Date(nowMY);
    deliveryDate.setDate(nowMY.getDate() + (rule.day_offset ?? 0));
    const orderDate = `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth() + 1).padStart(2, "0")}-${String(deliveryDate.getDate()).padStart(2, "0")}`;

    // Duplicate check: match by customer + date + destination (unique per rule)
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("customer_id", rule.customer_id)
      .eq("order_date", orderDate)
      .eq("destination", rule.destination ?? "")
      .ilike("remark", "%[AUTO]%")
      .limit(1);

    if (existing && existing.length > 0) {
      continue; // Skip duplicate
    }

    const { data: newOrder, error: insertErr } = await supabase
      .from("orders")
      .insert({
        order_date: orderDate,
        customer_id: rule.customer_id,
        destination: rule.destination,
        quantity_liters: rule.quantity_liters,
        remark: rule.remark ? `[AUTO] ${rule.remark}` : "[AUTO] Recurring order",
        status: "pending",
        bukku_sync_status: "pending",
        stock_sync_status: "pending",
        created_by: adminDriver?.id ?? null,
      })
      .select("id")
      .single();

    if (insertErr) {
      errors.push(`Rule ${rule.id}: ${insertErr.message}`);
    } else {
      created.push(newOrder.id);

      // Create order_items from recurring_rule_items
      const { data: ruleItems } = await supabase
        .from("recurring_rule_items")
        .select("product_id, quantity_liters, sort_order")
        .eq("rule_id", rule.id)
        .order("sort_order");

      if (ruleItems && ruleItems.length > 0) {
        await supabase.from("order_items").insert(
          ruleItems.map((ri: { product_id: string | null; quantity_liters: number; sort_order: number }) => ({
            order_id: newOrder.id,
            product_id: ri.product_id,
            quantity_liters: ri.quantity_liters,
            unit_price: 0,
            sst_rate: 0,
            sort_order: ri.sort_order,
          }))
        );
      }
    }
  }

  return NextResponse.json({
    message: `Processed ${rules.length} rules for ${todayName}`,
    created: created.length,
    createdIds: created,
    errors,
  });
}

