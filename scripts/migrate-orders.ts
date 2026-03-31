/**
 * TKO Central — Data Migration Script
 * Reads "Order Log Book.xlsx" and imports: customers, drivers, vehicles, orders, recurring_rules
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-orders.ts
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const XLSX_PATH = process.env.XLSX_PATH || path.join(__dirname, "Order Log Book.xlsx");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`❌ File not found: ${XLSX_PATH}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseExcelDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim() || null;
}

function num(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSheet(workbook: XLSX.WorkBook, name: string): any[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    console.warn(`⚠️  Sheet "${name}" not found`);
    return [];
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

// ── Customers ──────────────────────────────────────────────

async function migrateCustomers(workbook: XLSX.WorkBook): Promise<Map<string, string>> {
  const rows = getSheet(workbook, "Customer List");
  console.log(`\n📋 Migrating ${rows.length} customers...`);

  const nameToId = new Map<string, string>();

  // First pass: load existing customers
  const { data: existing } = await supabase.from("customers").select("id, name");
  for (const c of existing ?? []) {
    nameToId.set(c.name.toUpperCase(), c.id);
  }
  const existingCount = nameToId.size;

  // Collect unique customer names from both sheets
  const customerNames = new Set<string>();
  const middleManMap = new Map<string, string>(); // customer -> middle man name

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const name = str(r["Customer"]);
    if (!name) continue;
    customerNames.add(name.toUpperCase());
    const mm = str(r["Middle Man"]);
    if (mm) middleManMap.set(name.toUpperCase(), mm.toUpperCase());
  }

  // Also extract customer names from Order Log (some may not be in Customer List)
  const orderRows = getSheet(workbook, "Order Log");
  for (const row of orderRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const name = str(r["Customer Name"]);
    if (name) customerNames.add(name.toUpperCase());
    const mm = str(r["Middle Man"]);
    if (mm) customerNames.add(mm.toUpperCase());
  }

  // Insert new customers
  let imported = 0;
  const batch: { name: string; is_active: boolean; bukku_sync_status: string }[] = [];

  for (const name of customerNames) {
    if (nameToId.has(name)) continue;
    batch.push({ name, is_active: true, bukku_sync_status: "pending" });
  }

  if (batch.length > 0) {
    // Insert in chunks of 200
    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200);
      const { data, error } = await supabase.from("customers").insert(chunk).select("id, name");
      if (error) {
        console.error(`  ❌ Batch insert error: ${error.message}`);
      } else {
        for (const c of data ?? []) {
          nameToId.set(c.name.toUpperCase(), c.id);
          imported++;
        }
      }
    }
  }

  // Update middle man references
  let mmUpdated = 0;
  for (const [custName, mmName] of middleManMap) {
    const custId = nameToId.get(custName);
    const mmId = nameToId.get(mmName);
    if (custId && mmId && custId !== mmId) {
      await supabase.from("customers").update({ middle_man_id: mmId }).eq("id", custId);
      mmUpdated++;
    }
  }

  console.log(`  ✅ Customers: ${imported} new, ${existingCount} existing, ${mmUpdated} middle man links`);
  return nameToId;
}

// ── Drivers ────────────────────────────────────────────────

async function migrateDrivers(workbook: XLSX.WorkBook): Promise<Map<string, string>> {
  const rows = getSheet(workbook, "Driver List");
  console.log(`\n🚗 Migrating ${rows.length} drivers...`);

  const nameToId = new Map<string, string>();
  let imported = 0;

  // Load existing
  const { data: existing } = await supabase.from("drivers").select("id, name");
  for (const d of existing ?? []) {
    nameToId.set(d.name, d.id);
  }

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const name = str(r["Driver"]);
    if (!name || nameToId.has(name)) continue;

    const { data, error } = await supabase
      .from("drivers")
      .insert({ name, role: "driver", is_active: true })
      .select("id")
      .single();

    if (error) {
      console.error(`  ❌ Driver "${name}": ${error.message}`);
    } else if (data) {
      nameToId.set(name, data.id);
      imported++;
    }
  }

  console.log(`  ✅ Drivers: ${imported} new, ${(existing ?? []).length} existing`);
  return nameToId;
}

// ── Vehicles ───────────────────────────────────────────────

async function migrateVehicles(workbook: XLSX.WorkBook): Promise<Map<string, string>> {
  const rows = getSheet(workbook, "Vehicle List");
  console.log(`\n🚛 Migrating ${rows.length} vehicles...`);

  const plateToId = new Map<string, string>();
  let imported = 0;

  // Load existing
  const { data: existing } = await supabase.from("vehicles").select("id, plate_number");
  for (const v of existing ?? []) {
    plateToId.set(v.plate_number.toUpperCase(), v.id);
  }

  // Also extract vehicles from Order Log "Truck No." column
  const truckEntries = new Set<string>();
  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const truck = str(r["Truck No."]);
    if (truck) truckEntries.add(truck);
  }

  // Order Log may have more trucks
  const orderRows = getSheet(workbook, "Order Log");
  for (const row of orderRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const truck = str(r["Truck No."]);
    if (truck) truckEntries.add(truck);
  }

  for (const truckStr of truckEntries) {
    // Format: "JPA6367 - Hino - 4600L" or just a name like "CYL"
    const parts = truckStr.split(" - ");
    const plate = parts[0].trim().toUpperCase();
    if (!plate || plateToId.has(plate)) continue;

    const type = parts.length > 1 ? parts[1]?.trim() : null;
    const capacityStr = parts.length > 2 ? parts[2]?.trim() : null;
    const capacity = capacityStr ? parseInt(capacityStr.replace(/[^0-9]/g, "")) || null : null;

    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        plate_number: plate,
        type,
        capacity_liters: capacity,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  ❌ Vehicle "${plate}": ${error.message}`);
    } else if (data) {
      plateToId.set(plate, data.id);
      imported++;
    }
  }

  console.log(`  ✅ Vehicles: ${imported} new, ${(existing ?? []).length} existing`);
  return plateToId;
}

// ── Orders ─────────────────────────────────────────────────

async function migrateOrders(
  workbook: XLSX.WorkBook,
  customerNameToId: Map<string, string>,
  driverNameToId: Map<string, string>,
  vehiclePlateToId: Map<string, string>
) {
  const rows = getSheet(workbook, "Order Log");
  console.log(`\n📦 Migrating ${rows.length} orders...`);

  const BATCH_SIZE = 100;
  let imported = 0;
  let skipped = 0;
  const batch: object[] = [];

  // Build a lookup for truck string -> vehicle ID
  // "JPA6367 - Hino - 4600L" -> look up "JPA6367"
  function findVehicleId(truckStr: string | null): string | null {
    if (!truckStr) return null;
    const plate = truckStr.split(" - ")[0].trim().toUpperCase();
    return vehiclePlateToId.get(plate) ?? null;
  }

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;

    const orderDate = parseExcelDate(r["Date"]);
    if (!orderDate) { skipped++; continue; }

    const customerName = str(r["Customer Name"])?.toUpperCase();
    if (!customerName) { skipped++; continue; }

    const customerId = customerNameToId.get(customerName);
    if (!customerId) {
      console.warn(`  ⚠️  Customer not found: "${customerName}"`);
      skipped++;
      continue;
    }

    const driverName = str(r["Driver"]);
    const driverId = driverName ? driverNameToId.get(driverName) ?? null : null;

    const vehicleId = findVehicleId(str(r["Truck No."]));

    const middleManName = str(r["Middle Man"])?.toUpperCase();
    const middleManId = middleManName ? customerNameToId.get(middleManName) ?? null : null;

    const acceptance = str(r["Acceptance"]);
    let status = "delivered"; // Default for historical orders
    if (acceptance === "Reject" || acceptance === "Rejected") status = "rejected";
    else if (acceptance === "Pending") status = "pending";
    else if (acceptance === "Accept" || acceptance === "Accepted") status = "delivered";

    const qty = num(r["Quantity (L)"]);
    const unitPrice = num(r["Unit Price (Sale)"]);
    const totalSale = num(r["Total Sale"]);
    const sst = num(r["SST 6%"]);
    const costToAgent = num(r["Cost to Agent"]);

    batch.push({
      order_date: orderDate,
      customer_id: customerId,
      destination: str(r["Destination"]),
      quantity_liters: qty,
      unit_price: unitPrice,
      total_sale: totalSale,
      sst_amount: sst,
      cost_price: costToAgent,
      load_from: str(r["Load from"]),
      driver_id: driverId,
      vehicle_id: vehicleId,
      dn_number: str(r["DN No."]),
      invoice_number: str(r["Invoice No."]),
      status,
      acceptance: str(r["Acceptance"]),
      order_type: middleManId ? "agent" : "own",
      middle_man_id: middleManId,
      commission_rate: num(r["Commission"]),
      remark: str(r["Remark"]),
      wages: num(r["Wages"]),
      allowance: num(r["Allowance"]),
      transport: num(r["Transport"]),
      smart_do_number: str(r["Smart Do No."]),
      references_number: str(r["References No."]),
      document_number: str(r["Document No."]),
      r95_liters: num(r["R95"]),
      ado_liters: num(r["ADO"]),
      bukku_sync_status: "pending",
      stock_sync_status: "synced", // Historical — don't trigger stock sync
    });

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from("orders").insert(batch);
      if (error) {
        console.error(`  ❌ Batch error at row ~${imported + skipped}: ${error.message}`);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
      process.stdout.write(`  ⏳ ${imported} orders imported...\r`);
      batch.length = 0;
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    const { error } = await supabase.from("orders").insert(batch);
    if (error) {
      console.error(`  ❌ Final batch error: ${error.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  console.log(`\n  ✅ Orders: ${imported} imported, ${skipped} skipped`);
}

// ── Recurring Rules ────────────────────────────────────────

async function migrateRecurringRules(
  workbook: XLSX.WorkBook,
  customerNameToId: Map<string, string>
) {
  const rows = getSheet(workbook, "Recurring Rules");
  if (rows.length === 0) return;
  console.log(`\n🔄 Migrating ${rows.length} recurring rules...`);

  let imported = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const customerName = str(r["Customer Name"])?.toUpperCase();
    if (!customerName) continue;

    const customerId = customerNameToId.get(customerName);
    if (!customerId) {
      console.warn(`  ⚠️  Customer not found for rule: "${customerName}"`);
      continue;
    }

    const isActive = str(r["Status"])?.toLowerCase() === "active";

    const { error } = await supabase.from("recurring_rules").insert({
      customer_id: customerId,
      destination: str(r["Destination"]),
      quantity_liters: num(r["Quantity (L)"]),
      remark: str(r["Remark"]),
      trigger_day: str(r["Trigger Day"]) ?? "Monday",
      day_offset: parseInt(String(r["Days Offset"] ?? "0")) || 0,
      is_active: isActive,
    });

    if (error) {
      console.error(`  ❌ Rule for "${customerName}": ${error.message}`);
    } else {
      imported++;
    }
  }

  console.log(`  ✅ Recurring Rules: ${imported} imported`);
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  console.log("🚀 TKO Central — Data Migration");
  console.log(`📁 Reading: ${XLSX_PATH}`);
  console.log(`🔗 Supabase: ${SUPABASE_URL}`);

  const workbook = XLSX.readFile(XLSX_PATH);
  console.log(`📊 Sheets: ${workbook.SheetNames.join(", ")}`);

  const customerMap = await migrateCustomers(workbook);
  const driverMap = await migrateDrivers(workbook);
  const vehicleMap = await migrateVehicles(workbook);
  await migrateOrders(workbook, customerMap, driverMap, vehicleMap);
  await migrateRecurringRules(workbook, customerMap);

  console.log("\n" + "═".repeat(50));
  console.log("✅ Migration complete!");
  console.log(`   Customers: ${customerMap.size}`);
  console.log(`   Drivers:   ${driverMap.size}`);
  console.log(`   Vehicles:  ${vehicleMap.size}`);
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
