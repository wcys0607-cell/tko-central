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
  delivery_address?: string;
  shipping_address?: string;
  addresses?: { address?: string; type?: string }[];
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
        // Sync delivery addresses for matched customer
        await syncContactAddresses(supabase, existing.id, contact);
      }
    } else {
      // Create new customer from Bukku data
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({
          name: contactName,
          phone: contact.phone || null,
          email: contact.email || null,
          address: contact.address || null,
          tin_number: contact.tax_number || null,
          bukku_contact_id: contact.id,
          bukku_sync_status: "synced",
          is_active: true,
        })
        .select("id")
        .single();

      if (error) {
        result.failed++;
        result.errors.push(`Create "${contactName}": ${error.message}`);
      } else {
        result.created++;
        // Sync delivery addresses for new customer
        if (newCustomer) {
          await syncContactAddresses(supabase, newCustomer.id, contact);
        }
      }
    }
  }

  return result;
}

/** Sync delivery addresses from Bukku contact to customer_addresses */
async function syncContactAddresses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  customerId: string,
  contact: BukkuContact
) {
  // Collect all addresses from the Bukku contact
  const addresses: string[] = [];

  if (contact.address) addresses.push(contact.address.trim());
  if (contact.delivery_address) addresses.push(contact.delivery_address.trim());
  if (contact.shipping_address) addresses.push(contact.shipping_address.trim());

  // Some Bukku contacts may have an addresses array
  if (contact.addresses && Array.isArray(contact.addresses)) {
    for (const addr of contact.addresses) {
      if (addr.address) addresses.push(addr.address.trim());
    }
  }

  // Deduplicate
  const unique = [...new Set(addresses.filter((a) => a.length > 0))];
  if (unique.length === 0) return;

  // Get existing addresses for this customer
  const { data: existing } = await supabase
    .from("customer_addresses")
    .select("address")
    .eq("customer_id", customerId);

  const existingSet = new Set(
    (existing ?? []).map((e: { address: string }) => e.address.toLowerCase().trim())
  );

  // Insert new addresses only
  const newAddresses = unique.filter(
    (a) => !existingSet.has(a.toLowerCase())
  );

  if (newAddresses.length > 0) {
    await supabase.from("customer_addresses").insert(
      newAddresses.map((address) => ({
        customer_id: customerId,
        address,
        source: "bukku",
      }))
    );
  }
}
