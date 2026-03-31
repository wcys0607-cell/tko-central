import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncBukkuContacts } from "@/lib/bukku/contacts";
import { createClient as createAdmin } from "@supabase/supabase-js";

// Allow up to 60 seconds for this sync endpoint
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncBukkuContacts();

  // Log sync run
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await admin.from("notifications_log").insert({
    type: "bukku_sync_contacts",
    message: `Contacts sync: ${result.matched} matched, ${result.created} created, ${result.failed} failed`,
    status: result.failed === 0 && result.errors.length === 0 ? "sent" : "failed",
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json(result);
}
