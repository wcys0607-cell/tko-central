import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBukkuConfig, bukkuFetch } from "@/lib/bukku/client";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getBukkuConfig();
  if (!config) return NextResponse.json({ error: "Bukku not configured" });

  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type") || "delivery_orders";
  const productId = req.nextUrl.searchParams.get("product_id");
  const contactId = req.nextUrl.searchParams.get("contact_id");

  // Fetch a contact to see its full structure (including addresses)
  if (contactId) {
    const res = await bukkuFetch<Record<string, unknown>>(config, {
      path: `/contacts/${contactId}`,
    });
    return NextResponse.json(res);
  }

  // Fetch a product to see its full structure
  if (productId) {
    const res = await bukkuFetch<Record<string, unknown>>(config, {
      path: `/products/${productId}`,
    });
    return NextResponse.json(res);
  }

  // Try fetching PDF for an SO
  const pdfId = req.nextUrl.searchParams.get("pdf_id");
  if (pdfId) {
    // Try multiple PDF URL patterns
    const patterns = [
      `/sales/orders/${pdfId}/pdf`,
      `/sales/orders/${pdfId}/share`,
      `/sales/orders/${pdfId}/download`,
    ];
    const results: Record<string, unknown> = {};
    for (const pattern of patterns) {
      try {
        const url = `${config.baseUrl}${pattern}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Company-Subdomain": config.subdomain,
          },
        });
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/pdf")) {
          results[pattern] = { status: res.status, contentType, size: res.headers.get("content-length"), found: true };
        } else {
          const body = await res.text().catch(() => "");
          results[pattern] = { status: res.status, contentType, body: body.substring(0, 500) };
        }
      } catch (e) {
        results[pattern] = { error: String(e) };
      }
    }

    // Also fetch the SO itself to look for share/pdf fields
    const soRes = await bukkuFetch<Record<string, unknown>>(config, {
      path: `/sales/orders/${pdfId}`,
    });
    results["so_fields"] = soRes.ok ? Object.keys(soRes.data?.transaction as Record<string, unknown> ?? soRes.data ?? {}) : soRes;
    results["so_data"] = soRes.data;

    return NextResponse.json(results);
  }

  // Fetch a specific DO/SO with full details
  if (id) {
    const res = await bukkuFetch<Record<string, unknown>>(config, {
      path: `/sales/${type}/${id}`,
    });
    return NextResponse.json(res);
  }

  // Fetch first DO with its full detail (to see form_items structure)
  const detail = req.nextUrl.searchParams.get("detail");
  if (detail === "1") {
    // First get list, then fetch first item's detail
    const listRes = await bukkuFetch<{ transactions: { id: number }[] }>(config, {
      path: `/sales/${type}`,
      params: { per_page: 1, status: "ready" },
    });
    if (listRes.ok && listRes.data?.transactions?.[0]) {
      const firstId = listRes.data.transactions[0].id;
      const detailRes = await bukkuFetch<Record<string, unknown>>(config, {
        path: `/sales/${type}/${firstId}`,
      });
      return NextResponse.json(detailRes);
    }
  }

  // List first few
  const res = await bukkuFetch<Record<string, unknown>>(config, {
    path: `/sales/${type}`,
    params: { per_page: 1 },
  });
  return NextResponse.json(res);
}
