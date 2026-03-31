import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetchAll } from "./client";

interface BukkuContact {
  id: number;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  tax_number?: string;
  address?: string;
  type?: string;
}

interface SyncResult {
  matched: number;
  created: number;
  failed: number;
  errors: string[];
}

export async function syncBukkuContacts(): Promise<SyncResult> {
  const config = await getBukkuConfig();
  if (!config) {
    return { matched: 0, created: 0, failed: 0, errors: ["Bukku not configured"] };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch all contacts from Bukku
  const bukkuRes = await bukkuFetchAll<BukkuContact>(config, "/contacts", "data");
  if (!bukkuRes.ok) {
    return { matched: 0, created: 0, failed: 0, errors: [bukkuRes.error ?? "Failed to fetch contacts"] };
  }

  const result: SyncResult = { matched: 0, created: 0, failed: 0, errors: [] };

  // Get all existing customers
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, bukku_contact_id, tin_number");

  const customersByName = new Map<string, { id: string; tin_number: string | null }>();
  const customersByBukkuId = new Set<number>();

  for (const c of customers ?? []) {
    customersByName.set(c.name.toLowerCase().trim(), { id: c.id, tin_number: c.tin_number });
    if (c.bukku_contact_id) customersByBukkuId.add(c.bukku_contact_id);
  }

  for (const contact of bukkuRes.data) {
    // Skip if already linked
    if (customersByBukkuId.has(contact.id)) {
      result.matched++;
      continue;
    }

    const contactName = (contact.company_name || contact.name || "").trim();
    if (!contactName) continue;

    // Try to match by name (case-insensitive)
    const existing = customersByName.get(contactName.toLowerCase());

    if (existing) {
      // Update existing customer with Bukku ID
      const updates: Record<string, unknown> = {
        bukku_contact_id: contact.id,
        bukku_sync_status: "synced",
      };

      // Update TIN if missing in our DB but present in Bukku
      if (!existing.tin_number && contact.tax_number) {
        updates.tin_number = contact.tax_number;
      }

      const { error } = await supabase
        .from("customers")
        .update(updates)
        .eq("id", existing.id);

      if (error) {
        result.failed++;
        result.errors.push(`Update "${contactName}": ${error.message}`);
      } else {
        result.matched++;
      }
    } else {
      // Create new customer from Bukku data
      const { error } = await supabase.from("customers").insert({
        name: contactName,
        phone: contact.phone || null,
        email: contact.email || null,
        address: contact.address || null,
        tin_number: contact.tax_number || null,
        bukku_contact_id: contact.id,
        bukku_sync_status: "synced",
        is_active: true,
      });

      if (error) {
        result.failed++;
        result.errors.push(`Create "${contactName}": ${error.message}`);
      } else {
        result.created++;
      }
    }
  }

  return result;
}
