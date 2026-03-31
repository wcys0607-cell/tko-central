import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetchAll } from "./client";

/** Actual Bukku contact shape from their API */
interface BukkuContact {
  id: number;
  legal_name: string | null;
  other_name: string | null;
  display_name: string | null;
  company_name: string | null;
  types: string[];
  email: string | null;
  phone_no: string | null;
  billing_party: string | null;
  shipping_party: string | null;
  billing_first_name: string | null;
  billing_last_name: string | null;
  shipping_first_name: string | null;
  shipping_last_name: string | null;
  reg_no: string | null;
  old_reg_no: string | null;
  tax_id_no: string | null;
  sst_reg_no: string | null;
  reg_no_type: string | null;
  entity_type: string | null;
  group_names: string | null;
  receivable_amount: number | null;
  payable_amount: number | null;
  net_receivable_amount: number | null;
  field_4: string | null;
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

/** Map a Bukku contact to our customer DB fields */
function mapBukkuToCustomer(contact: BukkuContact, contactName: string) {
  const fields: Record<string, unknown> = {
    bukku_contact_id: contact.id,
    bukku_sync_status: "synced",
    bukku_raw: contact,
    updated_at: new Date().toISOString(),
  };
  if (contact.phone_no) fields.phone = contact.phone_no;
  if (contact.email) fields.email = contact.email;
  if (contact.tax_id_no) fields.tin_number = contact.tax_id_no;
  if (contact.reg_no) fields.registration_number = contact.reg_no;
  if (contact.billing_party) {
    fields.billing_address = contact.billing_party;
    fields.address = contact.billing_party;
  }
  if (contact.shipping_party) fields.shipping_address = contact.shipping_party;
  if (contact.field_4) fields.bank_account = contact.field_4;
  const contactPerson = [contact.billing_first_name, contact.billing_last_name].filter(Boolean).join(" ");
  if (contactPerson) fields.contact_person = contactPerson;
  if (contact.other_name && contact.other_name !== contactName) {
    fields.short_name = contact.other_name;
  }
  return fields;
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

  // Fetch ALL contacts from Bukku
  const bukkuRes = await bukkuFetchAll<BukkuContact>(config, "/contacts", "contacts");
  if (!bukkuRes.ok) {
    return { matched: 0, created: 0, skipped: 0, failed: 0, total_fetched: 0, errors: [bukkuRes.error ?? "Failed to fetch contacts"] };
  }

  const result: SyncResult = { matched: 0, created: 0, skipped: 0, failed: 0, total_fetched: bukkuRes.data.length, errors: [] };

  // Get all existing customers in one query
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, bukku_contact_id")
    .order("name");

  const customersByName = new Map<string, string>();
  const customersByBukkuId = new Map<number, string>();
  for (const c of customers ?? []) {
    customersByName.set(c.name.toLowerCase().trim(), c.id);
    if (c.bukku_contact_id) customersByBukkuId.set(c.bukku_contact_id, c.id);
  }

  // Get all existing addresses in one query for dedup
  const { data: allAddresses } = await supabase
    .from("customer_addresses")
    .select("customer_id, address");
  const existingAddressSet = new Set<string>();
  for (const a of allAddresses ?? []) {
    existingAddressSet.add(`${a.customer_id}::${a.address.toLowerCase().trim()}`);
  }

  // Prepare batch arrays
  const updateBatch: { id: string; fields: Record<string, unknown> }[] = [];
  const createBatch: Record<string, unknown>[] = [];
  const addressBatch: { customer_id: string; address: string; source: string }[] = [];

  // Temporary map for new contacts that need addresses after creation
  const newContactAddresses = new Map<string, string[]>(); // contactName -> addresses

  // Filter to customers only and prepare batches
  for (const contact of bukkuRes.data) {
    if (!contact.types || !contact.types.includes("customer")) {
      result.skipped++;
      continue;
    }

    const contactName = (contact.legal_name || contact.display_name || contact.company_name || "").trim();
    if (!contactName) {
      result.skipped++;
      continue;
    }

    const fields = mapBukkuToCustomer(contact, contactName);

    // Collect addresses for this contact
    const addresses: string[] = [];
    if (contact.billing_party) addresses.push(contact.billing_party.trim());
    if (contact.shipping_party) addresses.push(contact.shipping_party.trim());
    const uniqueAddresses = [...new Set(addresses.filter(a => a.length > 0))];

    // Check if already linked by bukku_contact_id
    const existingLinkedId = customersByBukkuId.get(contact.id);
    if (existingLinkedId) {
      updateBatch.push({ id: existingLinkedId, fields });
      // Queue addresses
      for (const addr of uniqueAddresses) {
        const key = `${existingLinkedId}::${addr.toLowerCase().trim()}`;
        if (!existingAddressSet.has(key)) {
          addressBatch.push({ customer_id: existingLinkedId, address: addr, source: "bukku" });
          existingAddressSet.add(key); // prevent duplicates within batch
        }
      }
      result.matched++;
      continue;
    }

    // Try to match by name
    const existingId = customersByName.get(contactName.toLowerCase());
    if (existingId) {
      updateBatch.push({ id: existingId, fields });
      for (const addr of uniqueAddresses) {
        const key = `${existingId}::${addr.toLowerCase().trim()}`;
        if (!existingAddressSet.has(key)) {
          addressBatch.push({ customer_id: existingId, address: addr, source: "bukku" });
          existingAddressSet.add(key);
        }
      }
      result.matched++;
    } else {
      // New customer
      createBatch.push({
        name: contactName.toUpperCase(),
        ...fields,
        is_active: true,
      });
      if (uniqueAddresses.length > 0) {
        newContactAddresses.set(contactName.toUpperCase(), uniqueAddresses);
      }
      result.created++;
    }
  }

  // Execute updates in parallel batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < updateBatch.length; i += BATCH_SIZE) {
    const chunk = updateBatch.slice(i, i + BATCH_SIZE);
    const promises = chunk.map(({ id, fields }) =>
      supabase.from("customers").update(fields).eq("id", id)
    );
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.error) {
        result.failed++;
        result.errors.push(r.error.message);
      }
    }
  }

  // Execute creates in batches of 50
  for (let i = 0; i < createBatch.length; i += BATCH_SIZE) {
    const chunk = createBatch.slice(i, i + BATCH_SIZE);
    const { data: newCustomers, error } = await supabase
      .from("customers")
      .insert(chunk)
      .select("id, name");

    if (error) {
      result.failed += chunk.length;
      result.errors.push(`Batch create: ${error.message}`);
    } else {
      // Queue addresses for newly created customers
      for (const nc of newCustomers ?? []) {
        const addrs = newContactAddresses.get(nc.name);
        if (addrs) {
          for (const addr of addrs) {
            const key = `${nc.id}::${addr.toLowerCase().trim()}`;
            if (!existingAddressSet.has(key)) {
              addressBatch.push({ customer_id: nc.id, address: addr, source: "bukku" });
              existingAddressSet.add(key);
            }
          }
        }
      }
    }
  }

  // Insert addresses in batches of 100
  for (let i = 0; i < addressBatch.length; i += 100) {
    const chunk = addressBatch.slice(i, i + 100);
    await supabase.from("customer_addresses").insert(chunk);
  }

  return result;
}
