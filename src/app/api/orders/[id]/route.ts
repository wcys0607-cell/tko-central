import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendWhatsApp,
  buildRejectedMessage,
  buildUrgentTodayMessage,
  buildLateEntryMessage,
  buildWeekendMessage,
  buildBigOrderMessage,
} from "@/lib/whatsapp";

const VALID_ACTIONS = ["approve", "reject", "cancel"] as const;
type OrderAction = (typeof VALID_ACTIONS)[number];

// Allowed status transitions
const ALLOWED_TRANSITIONS: Record<OrderAction, string[]> = {
  approve: ["pending"],
  reject: ["pending"],
  cancel: ["pending", "approved", "delivered"],
};

async function getAuthenticatedDriver(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, name, role, is_active")
    .eq("auth_user_id", user.id)
    .single();

  if (!driver || !driver.is_active) return null;
  return driver;
}

// PATCH /api/orders/[id]
// body: { action: "approve" | "reject" | "cancel", reason?: string }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check: must be authenticated with valid driver profile
  const driver = await getAuthenticatedDriver(supabase);
  if (!driver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, reason } = body as { action: string; reason?: string };

  // Validate action
  if (!VALID_ACTIONS.includes(action as OrderAction)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Role check: only admin/manager can approve/reject/cancel
  if (!["admin", "manager"].includes(driver.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch order with joins
  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select(`
      *,
      customer:customer_id(id,name),
      driver:driver_id(id,name,phone),
      creator:created_by(id,name,phone)
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Status guard: only allow valid transitions
  const validAction = action as OrderAction;
  if (!ALLOWED_TRANSITIONS[validAction].includes(order.status)) {
    return NextResponse.json(
      { error: `Cannot ${action} an order with status '${order.status}'` },
      { status: 422 }
    );
  }

  if (validAction === "approve") {
    const { error } = await supabase
      .from("orders")
      .update({
        status: "approved",
        approved_by: driver.id, // derived from session, not client
        bukku_sync_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (validAction === "reject") {
    const existingRemark = order.remark ?? "";
    const newRemark = reason
      ? `[REJECTED] ${reason}${existingRemark ? " | " + existingRemark : ""}`
      : existingRemark;

    const { error } = await supabase
      .from("orders")
      .update({
        status: "rejected",
        remark: newRemark,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // WhatsApp to creator
    const creator = order.creator as { name?: string; phone?: string } | null;
    const customer = order.customer as { name?: string } | null;
    if (creator?.phone) {
      await sendWhatsApp({
        phone: creator.phone,
        message: buildRejectedMessage({
          orderId: id,
          customerName: customer?.name ?? "",
          destination: order.destination ?? "",
          quantityLiters: order.quantity_liters ?? 0,
          creatorName: creator.name ?? "Staff",
          managerPhone: "",
        }),
        referenceId: id,
        type: "order_rejected",
        recipientName: creator.name,
      });
    }

    return NextResponse.json({ success: true });
  }

  if (validAction === "cancel") {
    const hasBukkuSO = !!order.bukku_so_id;

    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, has_bukku_so: hasBukkuSO });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// POST /api/orders/[id] — WhatsApp notifications for new order
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check
  const driver = await getAuthenticatedDriver(supabase);
  if (!driver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("*, customer:customer_id(id,name), creator:created_by(id,name)")
    .eq("id", id)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: configRows } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["MANAGER_PHONE", "BIG_ORDER_THRESHOLD", "LATE_ENTRY_CUTOFF_HOUR"]);

  const cfg: Record<string, string> = {};
  for (const row of configRows ?? []) {
    if (row.key && row.value) cfg[row.key] = row.value;
  }

  const managerPhone = cfg["MANAGER_PHONE"] ?? "60127681224";
  const bigOrderThreshold = parseInt(cfg["BIG_ORDER_THRESHOLD"] ?? "5000");
  const lateHour = parseInt(cfg["LATE_ENTRY_CUTOFF_HOUR"] ?? "17");

  const customer = order.customer as { name?: string } | null;
  const creator = order.creator as { name?: string } | null;

  // Use Malaysia timezone (UTC+8) for date comparisons
  const nowMY = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
  const orderDate = new Date(order.order_date + "T00:00:00");
  const todayDate = new Date(nowMY);
  todayDate.setHours(0, 0, 0, 0);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const currentHour = nowMY.getHours();
  const dayOfWeek = nowMY.getDay();

  const qty = order.quantity_liters ?? 0;
  const unitPrice = order.unit_price ?? 0;

  const msgParams = {
    orderId: id,
    customerName: customer?.name ?? "",
    destination: order.destination ?? "",
    quantityLiters: qty,
    creatorName: creator?.name ?? "Staff",
    managerPhone,
  };

  const notifications: Promise<unknown>[] = [];

  if (orderDate.getTime() === todayDate.getTime()) {
    notifications.push(sendWhatsApp({
      phone: managerPhone,
      message: buildUrgentTodayMessage(msgParams),
      referenceId: id,
      type: "order_urgent",
      recipientName: "Manager",
    }));
  } else if (orderDate.getTime() === tomorrowDate.getTime() && currentHour >= lateHour) {
    notifications.push(sendWhatsApp({
      phone: managerPhone,
      message: buildLateEntryMessage(msgParams),
      referenceId: id,
      type: "order_late_entry",
      recipientName: "Manager",
    }));
  } else if (orderDate.getDay() === 1 && (dayOfWeek === 0 || (dayOfWeek === 6 && currentHour >= lateHour))) {
    notifications.push(sendWhatsApp({
      phone: managerPhone,
      message: buildWeekendMessage(msgParams),
      referenceId: id,
      type: "order_weekend",
      recipientName: "Manager",
    }));
  }

  const diffDays = Math.floor((orderDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
  if (qty > bigOrderThreshold && unitPrice >= 1 && diffDays >= 0 && diffDays <= 2) {
    notifications.push(sendWhatsApp({
      phone: managerPhone,
      message: buildBigOrderMessage(msgParams),
      referenceId: id,
      type: "order_big",
      recipientName: "Manager",
    }));
  }

  await Promise.all(notifications);

  return NextResponse.json({ success: true });
}
