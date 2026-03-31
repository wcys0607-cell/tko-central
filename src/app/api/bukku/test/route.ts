import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBukkuConfig, testBukkuConnection, bukkuFetch } from "@/lib/bukku/client";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const config = await getBukkuConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Bukku not configured. Set BUKKU_BASE_URL and BUKKU_API_TOKEN in App Configuration." });
  }

  const result = await testBukkuConnection(config);
  return NextResponse.json(result);
}

/** Debug endpoint: GET /api/bukku/test?debug=contacts to see raw pagination response */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const config = await getBukkuConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Bukku not configured" });
  }

  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") ?? "contacts";
  const page = url.searchParams.get("page") ?? "1";

  // Fetch page 1 with per_page to see actual meta structure
  const res = await bukkuFetch<Record<string, unknown>>(config, {
    path: `/${debug}`,
    params: { page: parseInt(page), per_page: 100 },
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error, status: res.status });
  }

  // Return just the meta + keys (not full data, too large)
  const meta = res.data?.["meta"];
  const dataArray = res.data?.["data"];
  const dataCount = Array.isArray(dataArray) ? dataArray.length : 0;
  const topLevelKeys = Object.keys(res.data ?? {});

  return NextResponse.json({
    ok: true,
    topLevelKeys,
    meta,
    dataCount,
    firstItem: Array.isArray(dataArray) && dataArray.length > 0 ? dataArray[0] : null,
  });
}
