import { createClient } from "@supabase/supabase-js";

export interface BukkuConfig {
  baseUrl: string;
  token: string;
  subdomain: string;
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
    .in("key", ["BUKKU_BASE_URL", "BUKKU_API_TOKEN", "BUKKU_SUBDOMAIN"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.key && row.value) map[row.key] = row.value;
  }

  const baseUrl = map["BUKKU_BASE_URL"];
  const token = map["BUKKU_API_TOKEN"];
  const subdomain = map["BUKKU_SUBDOMAIN"];

  if (!baseUrl || !token || !subdomain) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token, subdomain };
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
        "Company-Subdomain": config.subdomain,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const errText = json ? JSON.stringify(json) : "Unknown error";
      return { ok: false, data: json as T, error: errText, status: res.status };
    }

    // Check for intercept responses (Bukku returns 200 but with intercept_type)
    if (json && typeof json === "object" && "intercept_type" in json) {
      return { ok: false, data: json as T, error: JSON.stringify(json), status: res.status };
    }

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

/**
 * Paginated GET — fetches all pages and returns combined data array.
 * Bukku uses { paging: { current_page, per_page, total }, [dataKey]: [...] }
 */
export async function bukkuFetchAll<T>(
  config: BukkuConfig,
  path: string,
  dataKey: string,
  params?: Record<string, string | number>
): Promise<{ ok: boolean; data: T[]; error?: string }> {
  const allData: T[] = [];
  let page = 1;
  const perPage = 100; // max per page

  while (true) {
    const res = await bukkuFetch<Record<string, unknown>>(config, {
      path,
      params: { ...params, page, per_page: perPage },
    });

    if (!res.ok) {
      return { ok: false, data: allData, error: res.error };
    }

    const items = (res.data?.[dataKey] as T[]) ?? [];
    allData.push(...items);

    // If no items returned, we've reached the end
    if (items.length === 0) break;

    // Bukku pagination: { paging: { current_page, per_page, total } }
    const paging = res.data?.["paging"] as { current_page?: number; per_page?: number; total?: number } | undefined;
    const total = paging?.total ?? 0;
    const currentPerPage = paging?.per_page ?? perPage;
    const lastPage = Math.ceil(total / currentPerPage);

    if (page >= lastPage) break;
    page++;
  }

  return { ok: true, data: allData };
}

/** Fetch a PDF from Bukku (returns raw binary buffer) */
export async function bukkuFetchPdf(
  config: BukkuConfig,
  path: string
): Promise<{ ok: boolean; data: ArrayBuffer | null; error?: string }> {
  const url = `${config.baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Company-Subdomain": config.subdomain,
      },
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("application/pdf")) {
      const text = await res.text().catch(() => "");
      return { ok: false, data: null, error: `Status ${res.status}: ${text.substring(0, 200)}` };
    }
    const buffer = await res.arrayBuffer();
    return { ok: true, data: buffer };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Test Bukku connection by fetching 1 contact */
export async function testBukkuConnection(
  config: BukkuConfig
): Promise<{ ok: boolean; error?: string; total?: number }> {
  const res = await bukkuFetch<Record<string, unknown>>(config, {
    path: "/contacts",
    params: { per_page: 1 },
  });
  if (!res.ok) return { ok: false, error: res.error };
  const paging = res.data?.["paging"] as { total?: number } | undefined;
  return { ok: true, total: paging?.total ?? 0 };
}
