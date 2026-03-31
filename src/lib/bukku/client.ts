import { createClient } from "@supabase/supabase-js";

interface BukkuConfig {
  baseUrl: string;
  token: string;
}

interface BukkuRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  params?: Record<string, string | number>;
  body?: unknown;
}

interface BukkuResponse<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  status: number;
}

/** Get Bukku config from app_config table (server-side only) */
export async function getBukkuConfig(): Promise<BukkuConfig | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["BUKKU_BASE_URL", "BUKKU_API_TOKEN"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.key && row.value) map[row.key] = row.value;
  }

  const baseUrl = map["BUKKU_BASE_URL"];
  const token = map["BUKKU_API_TOKEN"];

  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

/** Make an authenticated request to the Bukku API */
export async function bukkuFetch<T = unknown>(
  config: BukkuConfig,
  opts: BukkuRequestOptions
): Promise<BukkuResponse<T>> {
  const url = new URL(`${config.baseUrl}${opts.path}`);

  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      url.searchParams.set(k, String(v));
    }
  }

  try {
    const res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, data: null, error: errText, status: res.status };
    }

    const json = await res.json();
    return { ok: true, data: json as T, status: res.status };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      status: 0,
    };
  }
}

/** Paginated GET — fetches all pages and returns combined data array */
export async function bukkuFetchAll<T>(
  config: BukkuConfig,
  path: string,
  dataKey: string,
  params?: Record<string, string | number>
): Promise<{ ok: boolean; data: T[]; error?: string }> {
  const allData: T[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await bukkuFetch<Record<string, unknown>>(config, {
      path,
      params: { ...params, page, per_page: limit, limit },
    });

    if (!res.ok) {
      return { ok: false, data: allData, error: res.error };
    }

    const items = (res.data?.[dataKey] as T[]) ?? [];
    allData.push(...items);

    // If no items returned, we've reached the end
    if (items.length === 0) break;

    // Check pagination meta (Laravel-style: meta.last_page or top-level last_page)
    const meta = res.data?.["meta"] as { last_page?: number; current_page?: number; total?: number } | undefined;
    const lastPage = meta?.last_page ?? (res.data?.["last_page"] as number | undefined);
    const currentPage = meta?.current_page ?? (res.data?.["current_page"] as number | undefined) ?? page;

    if (!lastPage || currentPage >= lastPage) break;
    page++;
  }

  return { ok: true, data: allData };
}

/** Test Bukku connection by fetching 1 contact */
export async function testBukkuConnection(
  config: BukkuConfig
): Promise<{ ok: boolean; error?: string }> {
  const res = await bukkuFetch(config, {
    path: "/contacts",
    params: { limit: 1 },
  });
  return { ok: res.ok, error: res.error };
}
