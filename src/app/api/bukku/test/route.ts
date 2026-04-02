import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBukkuConfig, testBukkuConnection } from "@/lib/bukku/client";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: driver } = await supabase
    .from("drivers")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (!driver || !["admin", "manager", "office"].includes(driver.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getBukkuConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Bukku not configured. Set BUKKU_BASE_URL, BUKKU_SUBDOMAIN, and BUKKU_API_TOKEN in App Configuration." });
  }

  const result = await testBukkuConnection(config);
  return NextResponse.json(result);
}
