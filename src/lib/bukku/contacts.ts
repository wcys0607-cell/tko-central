import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetchAll } from "./client";

/** Actual Bukku contact shape from their API */
interface BukkuContact {
  id: number;
  legal_name: string | null;
  other_name: string | null;
  display_name: string | null;
  company_name: string | null;
  types: string[]; // ["customer"], ["supplier"], ["customer","supplier"]
  email: string | null;
  phone_no: string | null;
  billing_party: string | null; // full billing address
  shipping_party: string | null; // full shipping address
  billing_first_name: string | null;
  billing_last_name: string | null;
  shipping_first_name: string | null;
  shipping_last_name: string | null;
  reg_no: string | null; // SSM registration number
  old_reg_no: string | null;
  tax_id_no: string | null; // TIN number
  sst_reg_no: string | null;
  reg_no_type: string | null;
  entity_type: string | null;
  group_names: string | null;
  receivable_amount: number | null;
  payable_amount: number | null;
  net_receivable_amount: number | null;
  field_4: string | null; // custom field (bank info in TKO)
  emails: string | null;
  mandate: string | null;
  is_archived: boolean;
  is_myinvois_ready: number | null;
  is_myinvois_validated: number | null;
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
}

interface SyncResult {
  matched: number;
  created: number;
  skipped: number;
  failed: number;
  total_fetched: number;
  errors: string[];
}

export async function syncBukkuContacts(): Promise<SyncResult> {
  const config = await getBukkuConfig();
  if (!config) {
    return { matched: 0, created: 0, skipped: 0, failed: 0, total_fetched: 0, errors: ["Bukku not configured. Set BUKKU_BASE_URL, BUKKU_API_TOKEN, and BUKKU_SUBDOMAIN."] };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch ALL contacts from Bukku (data key is "contacts")
  const bukkuRes = await bukkuFetchAll<BukkuContact>(config, "/contacts", "contacts");
  if (!bukkuRes.ok) {
    return { matched: 0, created: 0, skipped: 0, failed: 0, total_fetched: 0, errors: [bukkuRes.error ?? "Failed to fetch contacts"] };
  }

  const result: SyncResult = { matched: 0, created: 0, skipped: 0, failed: 0, total_fetched: bukkuRes.data.length, errors: [] };

  // Get all existing customers
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, bukku_contact_id")
    .order("name");

  const customersByName = new Map<string, string>(); // name -> id
  const customersByBukkuId = new Map<number, string>(); // bukku_id -> id

  for (const c of customers ?? []) {
    customersByName.set(c.name.toLowerCase().trim(), c.id);
    if (c.bukku_contact_id) customersByBukkuId.set(c.bukku_contact_id, c.id);
  }

  for (const contact of bukkuRes.data) {
    // Only sync contacts that include "customer" type
    if (!contact.types || !contact.types.includes("customer")) {
      result.skipped++;
      continue;
    }

    const contactName = (contact.legal_name || contact.display_name || contact.company_name || "").trim();
    if (!contactName) {
      result.skipped++;
      continue;
    }

    // Map Bukku fields → our DB fields
    const bukkuFields: Record<string, unknown> = {
      bukku_contact_id: contact.id,
      bukku_sync_status: "synced",
      bukku_raw: contact,
      updated_at: new Date().toISOString(),
    };

    // Contact details
    if (contact.phone_no) bukkuFields.phone = contact.phone_no;
    if (contact.email) bukkuFields.email = contact.email;
    if (contact.tax_id_no) bukkuFields.tin_number = contact.tax_id_no;
    if (contact.reg_no) bukkuFields.registration_number = contact.reg_no;
    if (contact.billing_party) bukkuFields.billing_address = contact.billing_party;
    if (contact.shipping_party) bukkuFields.shipping_address = contact.shipping_party;
    // Use billing_party as main address if no separate address
    if (contact.billing_party) bukkuFields.address = contact.billing_party;
    // Bank info from custom field_4 (if present)
    if (contact.field_4) bukkuFields.bank_account = contact.field_4;
    // Contact person from billing name
    const contactPerson = [contact.billing_first_name, contact.billing_last_name].filter(Boolean).join(" ");
    if (contactPerson) bukkuFields.contact_person = contactPerson;
    // Notes from entity type / other info
    if (contact.other_name && contact.other_name !== contactName) {
      bukkuFields.short_name = contact.other_name;
    }

    // Check if already linked by bukku_contact_id — re-sync details
    const existingLinkedId = customersByBukkuId.get(contact.id);
    if (existingLinkedId) {
      const { error } = await supabase
        .from("customers")
        .update(bukkuFields)
        .eq("id", existingLinkedId);

      if (error) {
        result.failed++;
        result.errors.push(`Re-sync "${contactName}": ${error.message}`);
      } else {
        result.matched++;
        await syncContactAddresses(supabase, existingLinkedId, contact);
      }
      continue;
    }

    // Try to match by name (case-insensitive)
    const existingId = customersByName.get(contactName.toLowerCase());

    if (existingId) {
      const { error } = await supabase
        .from("customers")
        .update(bukkuFields)
        .eq("id", existingId);

      if (error) {
        result.failed++;
        result.errors.push(`Update "${contactName}": ${error.message}`);
      } else {
        result.matched++;
        await syncContactAddresses(supabase, existingId, contact);
      }
    } else {
      // Create new customer from Bukku
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({
          name: contactName.toUpperCase(),
          ...bukkuFields,
          is_active: true,
        })
        .select("id")
        .single();

      if (error) {
        result.failed++;
        result.errors.push(`Create "${contactName}": ${error.message}`);
      } else {
        result.created++;
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

  if (contact.billing_party) addresses.push(contact.billing_party.trim());
  if (contact.shipping_party) addresses.push(contact.shipping_party.trim());

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
