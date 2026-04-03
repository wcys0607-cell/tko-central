import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncInvoiceStatus } from "@/lib/bukku/invoices";
import { createClient as createAdmin } from "@supabase/supabase-js";

export async function POST() {
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

  const result = await syncInvoiceStatus();

  // Log sync run
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await admin.from("notifications_log").insert({
    type: "bukku_sync_invoices",
    message: `Chain sync: ${result.linked_dn} DN linked, ${result.linked_inv} INV linked, ${result.updated} payment updated, ${result.overdue} overdue, ${result.failed} failed`,
    status: result.failed === 0 ? "sent" : "failed",
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json(result);
}
