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

  // Check if list endpoint includes form_items
  const checkList = req.nextUrl.searchParams.get("check_list");
  if (checkList === "1") {
    const listRes = await bukkuFetch<{ transactions: Record<string, unknown>[] }>(config, {
      path: `/sales/${type}`,
      params: { per_page: 2 },
    });
    if (listRes.ok && listRes.data?.transactions?.[0]) {
      const first = listRes.data.transactions[0];
      const hasFormItems = "form_items" in first;
      const formItemsValue = first.form_items;
      // Also fetch detail to compare
      const detailRes = await bukkuFetch<Record<string, unknown>>(config, {
        path: `/sales/${type}/${first.id}`,
      });
      const detailTx = (detailRes.data as Record<string, unknown>)?.transaction as Record<string, unknown> | undefined;
      return NextResponse.json({
        list_has_form_items: hasFormItems,
        list_form_items: formItemsValue,
        list_keys: Object.keys(first),
        detail_has_form_items: detailTx ? "form_items" in detailTx : false,
        detail_form_items: detailTx?.form_items,
      });
    }
    return NextResponse.json({ error: "No transactions found", listRes });
  }

  // Test void: try different approaches to void a transaction
  const voidId = req.nextUrl.searchParams.get("void_id");
  const voidType = req.nextUrl.searchParams.get("void_type") || "orders"; // orders, delivery_orders, invoices
  if (voidId) {
    const results: Record<string, unknown> = {};

    // First fetch the transaction
    const getRes = await bukkuFetch<{ transaction: Record<string, unknown> }>(config, {
      path: `/sales/${voidType}/${voidId}`,
    });
    results["current_status"] = getRes.ok ? getRes.data?.transaction?.status : getRes.error;

    // Approach 1: PUT with minimal { status: "void" }
    const res1 = await bukkuFetch<Record<string, unknown>>(config, {
      method: "PUT",
      path: `/sales/${voidType}/${voidId}`,
      body: { status: "void" },
    });
    results["put_minimal"] = { ok: res1.ok, data: res1.data, error: res1.error };

    // Approach 2: POST to /void sub-endpoint
    const res2 = await bukkuFetch<Record<string, unknown>>(config, {
      method: "POST",
      path: `/sales/${voidType}/${voidId}/void`,
    });
    results["post_void_endpoint"] = { ok: res2.ok, data: res2.data, error: res2.error };

    // Approach 3: PATCH with { status: "void" }
    const res3 = await bukkuFetch<Record<string, unknown>>(config, {
      method: "PATCH",
      path: `/sales/${voidType}/${voidId}`,
      body: { status: "void" },
    });
    results["patch_void"] = { ok: res3.ok, data: res3.data, error: res3.error };

    // Approach 4: PUT with full tx + status override
    if (getRes.ok && getRes.data?.transaction) {
      const res4 = await bukkuFetch<Record<string, unknown>>(config, {
        method: "PUT",
        path: `/sales/${voidType}/${voidId}`,
        body: { ...getRes.data.transaction, status: "void" },
      });
      results["put_full_void"] = { ok: res4.ok, data: res4.data, error: res4.error };
    }

    // Re-check status
    const checkRes = await bukkuFetch<{ transaction: Record<string, unknown> }>(config, {
      path: `/sales/${voidType}/${voidId}`,
    });
    results["status_after"] = checkRes.ok ? checkRes.data?.transaction?.status : checkRes.error;

    return NextResponse.json(results);
  }

  // Dry-run void: just check what status values Bukku accepts without actually voiding
  const dryVoid = req.nextUrl.searchParams.get("dry_void");
  if (dryVoid === "1") {
    // Fetch a transaction to see its current status and available fields
    const res = await bukkuFetch<Record<string, unknown>>(config, {
      path: `/sales/${type}`,
      params: { per_page: 1, status: "void" },
    });
    return NextResponse.json({ void_transactions: res });
  }

  // List first few
  const res = await bukkuFetch<Record<string, unknown>>(config, {
    path: `/sales/${type}`,
    params: { per_page: 1 },
  });
  return NextResponse.json(res);
}
