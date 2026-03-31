import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncInvoiceStatus } from "@/lib/bukku/invoices";
import { createClient as createAdmin } from "@supabase/supabase-js";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncInvoiceStatus();

  // Log sync run
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await admin.from("notifications_log").insert({
    type: "bukku_sync_invoices",
    message: `Invoice sync: ${result.updated} updated, ${result.overdue} overdue, ${result.failed} failed`,
    status: result.failed === 0 ? "sent" : "failed",
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json(result);
}
