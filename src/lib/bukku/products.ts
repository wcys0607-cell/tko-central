import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetchAll, bukkuFetch } from "./client";

interface BukkuProduct {
  id: number;
  name: string;
  sku?: string;
  sale_price?: number;
  purchase_price?: number;
  type?: string;
  is_selling?: boolean;
  is_buying?: boolean;
  is_archived?: boolean;
  classification_code?: string;
  unit_label?: string;
}

interface SyncResult {
  matched: number;
  created: number;
  failed: number;
  errors: string[];
}

export async function syncBukkuProducts(): Promise<SyncResult> {
  const config = await getBukkuConfig();
  if (!config) {
    return { matched: 0, created: 0, failed: 0, errors: ["Bukku not configured"] };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch all products from Bukku
  const bukkuRes = await bukkuFetchAll<BukkuProduct>(config, "/products", "products");
  if (!bukkuRes.ok) {
    return { matched: 0, created: 0, failed: 0, errors: [bukkuRes.error ?? "Failed to fetch products"] };
  }

  const result: SyncResult = { matched: 0, created: 0, failed: 0, errors: [] };

  // Get all existing products
  const { data: products } = await supabase
    .from("products")
    .select("id, name, bukku_product_id, classification_code");

  const productsByName = new Map<string, { id: string; classification_code: string | null }>();
  const productsByBukkuId = new Set<number>();

  for (const p of products ?? []) {
    productsByName.set(p.name.toLowerCase().trim(), { id: p.id, classification_code: p.classification_code });
    if (p.bukku_product_id) productsByBukkuId.add(p.bukku_product_id);
  }

  for (const product of bukkuRes.data) {
    const productName = (product.name || "").trim();
    if (!productName) continue;

    // Fetch individual product detail to get unit label
    const detailRes = await bukkuFetch<{ product: { unit_label?: string; product_unit_label?: string; units?: { label?: string }[] } }>(config, {
      path: `/products/${product.id}`,
    });
    const detail = detailRes.data?.product;
    const unitLabel = detail?.unit_label ?? detail?.product_unit_label ?? detail?.units?.[0]?.label ?? null;

    // Already linked — just update unit
    if (productsByBukkuId.has(product.id)) {
      if (unitLabel) {
        // Find product by bukku_product_id and update unit
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("bukku_product_id", product.id)
          .single();
        if (existing) {
          await supabase.from("products").update({ unit: unitLabel }).eq("id", existing.id);
        }
      }
      result.matched++;
      continue;
    }

    const existing = productsByName.get(productName.toLowerCase());

    if (existing) {
      const updates: Record<string, unknown> = {
        bukku_product_id: product.id,
      };

      if (!existing.classification_code && product.classification_code) {
        updates.classification_code = product.classification_code;
      }
      if (unitLabel) updates.unit = unitLabel;

      const { error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", existing.id);

      if (error) {
        result.failed++;
        result.errors.push(`Update "${productName}": ${error.message}`);
      } else {
        result.matched++;
      }
    } else {
      // Create new product from Bukku data
      const { error } = await supabase.from("products").insert({
        name: productName,
        default_price: product.sale_price ?? null,
        classification_code: product.classification_code ?? null,
        bukku_product_id: product.id,
        unit: unitLabel ?? "Liters",
        is_active: true,
      });

      if (error) {
        result.failed++;
        result.errors.push(`Create "${productName}": ${error.message}`);
      } else {
        result.created++;
      }
    }
  }

  return result;
}
