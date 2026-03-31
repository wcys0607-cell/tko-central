import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetchAll } from "./client";

interface BukkuProduct {
  id: number;
  name: string;
  code?: string;
  unit_price?: number;
  classification_code?: string;
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
  const bukkuRes = await bukkuFetchAll<BukkuProduct>(config, "/products", "data");
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
    // Skip if already linked
    if (productsByBukkuId.has(product.id)) {
      result.matched++;
      continue;
    }

    const productName = (product.name || "").trim();
    if (!productName) continue;

    const existing = productsByName.get(productName.toLowerCase());

    if (existing) {
      const updates: Record<string, unknown> = {
        bukku_product_id: product.id,
      };

      if (!existing.classification_code && product.classification_code) {
        updates.classification_code = product.classification_code;
      }

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
        default_price: product.unit_price ?? null,
        classification_code: product.classification_code ?? null,
        bukku_product_id: product.id,
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
