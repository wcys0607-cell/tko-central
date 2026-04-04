import { createClient } from "@supabase/supabase-js";
import { getBukkuConfig, bukkuFetch, bukkuFetchAll } from "./client";

/** Bukku contact shape from the list endpoint */
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

/** Bukku contact detail (individual endpoint) includes addresses */
interface BukkuContactDetail extends BukkuContact {
  addresses?: {
    id: number;
    name: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    country_code: string | null;
    text: string | null;
    is_default_billing: boolean;
    is_default_shipping: boolean;
  }[];
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

/** Fetch individual contact detail to get full addresses array */
async function fetchContactAddresses(
  config: { baseUrl: string; token: string; subdomain: string },
  contactId: number
): Promise<string[]> {
  const res = await bukkuFetch<{ contact: BukkuContactDetail }>(config, {
    path: `/contacts/${contactId}`,
  });
  if (!res.ok || !res.data?.contact?.addresses) return [];

  return res.data.contact.addresses
    .map((a) => {
      // Use the address name as label if available, otherwise use the text
      const label = a.name ? `${a.name}` : null;
      const text = a.text?.trim();
      if (!text) return null;
      // Format: "Label - Full Address" or just "Full Address"
      return label ? `${label} - ${text}` : text;
    })
    .filter((a): a is string => a != null && a.length > 0);
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

  // Fetch ALL contacts from Bukku (list endpoint)
  const bukkuRes = await bukkuFetchAll<BukkuContact>(config, "/contacts", "contacts");
  if (!bukkuRes.ok) {
    return { matched: 0, created: 0, skipped: 0, failed: 0, total_fetched: 0, errors: [bukkuRes.error ?? "Failed to fetch contacts"] };
  }

  const result: SyncResult = { matched: 0, created: 0, skipped: 0, failed: 0, total_fetched: bukkuRes.data.length, errors: [] };

  // Get all existing customers (default Supabase limit is 1000, so override)
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, bukku_contact_id")
    .order("name")
    .limit(10000);

  const customersByName = new Map<string, string>();
  const customersByBukkuId = new Map<number, string>();
  for (const c of customers ?? []) {
    customersByName.set(c.name.toLowerCase().trim(), c.id);
    if (c.bukku_contact_id) customersByBukkuId.set(c.bukku_contact_id, c.id);
  }

  // Filter to active customers only
  const activeCustomers = bukkuRes.data.filter((contact) => {
    if (!contact.types || !contact.types.includes("customer") || contact.is_archived) {
      result.skipped++;
      return false;
    }
    const name = (contact.legal_name || contact.display_name || contact.company_name || "").trim();
    if (!name) {
      result.skipped++;
      return false;
    }
    return true;
  });

  // Prepare batch arrays
  const updateBatch: { id: string; fields: Record<string, unknown> }[] = [];
  const createBatch: Record<string, unknown>[] = [];
  // Map: customer_id -> bukku contact id (for address fetching)
  const customerBukkuIds = new Map<string, number>();
  const newContactBukkuIds = new Map<string, number>(); // contactName -> bukku id

  for (const contact of activeCustomers) {
    const contactName = (contact.legal_name || contact.display_name || contact.company_name || "").trim();
    const fields = mapBukkuToCustomer(contact, contactName);

    const existingLinkedId = customersByBukkuId.get(contact.id);
    if (existingLinkedId) {
      updateBatch.push({ id: existingLinkedId, fields });
      customerBukkuIds.set(existingLinkedId, contact.id);
      result.matched++;
      continue;
    }

    const existingId = customersByName.get(contactName.toLowerCase());
    if (existingId) {
      updateBatch.push({ id: existingId, fields });
      customerBukkuIds.set(existingId, contact.id);
      result.matched++;
    } else {
      createBatch.push({
        name: contactName.toUpperCase(),
        ...fields,
        is_active: true,
      });
      newContactBukkuIds.set(contactName.toUpperCase(), contact.id);
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

  // Execute creates using upsert to handle duplicates gracefully
  // (contacts created in a previous sync already have bukku_contact_id set)
  let actualCreated = 0;
  for (let i = 0; i < createBatch.length; i += BATCH_SIZE) {
    const chunk = createBatch.slice(i, i + BATCH_SIZE);
    // Use upsert with bukku_contact_id conflict resolution
    const { data: newCustomers, error } = await supabase
      .from("customers")
      .upsert(chunk, { onConflict: "bukku_contact_id", ignoreDuplicates: false })
      .select("id, name");

    if (error) {
      // Batch failed — fall back to individual upserts
      for (const record of chunk) {
        const { data: single, error: singleErr } = await supabase
          .from("customers")
          .upsert(record, { onConflict: "bukku_contact_id", ignoreDuplicates: false })
          .select("id, name")
          .single();

        if (singleErr) {
          result.failed++;
          if (result.errors.length < 5) {
            result.errors.push(`Create "${(record as { name?: string }).name}": ${singleErr.message}`);
          }
        } else if (single) {
          actualCreated++;
          const bukkuId = newContactBukkuIds.get(single.name);
          if (bukkuId) customerBukkuIds.set(single.id, bukkuId);
        }
      }
    } else {
      actualCreated += (newCustomers ?? []).length;
      for (const nc of newCustomers ?? []) {
        const bukkuId = newContactBukkuIds.get(nc.name);
        if (bukkuId) customerBukkuIds.set(nc.id, bukkuId);
      }
    }
  }
  // Fix created count to reflect actual success
  result.created = actualCreated;

  // Now fetch addresses for all customers from individual contact endpoints
  // Delete all existing bukku-sourced addresses first (replace on each sync)
  const allCustomerIds = [...customerBukkuIds.keys()];
  for (let i = 0; i < allCustomerIds.length; i += 100) {
    const chunk = allCustomerIds.slice(i, i + 100);
    await supabase.from("customer_addresses").delete().in("customer_id", chunk).eq("source", "bukku");
  }

  // Fetch addresses in parallel batches of 10 (to avoid overwhelming the API)
  const addressBatch: { customer_id: string; address: string; source: string }[] = [];
  const entries = [...customerBukkuIds.entries()];
  for (let i = 0; i < entries.length; i += 10) {
    const chunk = entries.slice(i, i + 10);
    const results = await Promise.all(
      chunk.map(async ([customerId, bukkuId]) => {
        const addresses = await fetchContactAddresses(config, bukkuId);
        return { customerId, addresses };
      })
    );
    for (const { customerId, addresses } of results) {
      for (const addr of addresses) {
        addressBatch.push({ customer_id: customerId, address: addr, source: "bukku" });
      }
    }
  }

  // Insert all addresses
  for (let i = 0; i < addressBatch.length; i += 100) {
    const chunk = addressBatch.slice(i, i + 100);
    await supabase.from("customer_addresses").insert(chunk);
  }

  return result;
}
