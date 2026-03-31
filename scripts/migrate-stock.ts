/**
 * TKO Central — Stock Data Migration Script
 * Reads "Stock Control DB.xlsx" and imports: stock_locations (update), stock_transactions, stock_history, stock_takes
 *
 * Usage:
 *   npx tsx scripts/migrate-stock.ts
 *
 * Expects .env.local in the project root with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Expects "Stock Control DB.xlsx" in the scripts/ directory.
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const XLSX_PATH =
  process.env.STOCK_XLSX_PATH ||
  path.join(__dirname, "Stock Control DB.xlsx");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`❌ File not found: ${XLSX_PATH}`);
  console.error("  Place 'Stock Control DB.xlsx' in the scripts/ directory.");
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

function parseExcelDateTime(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}T${String(date.H).padStart(2, "0")}:${String(date.M).padStart(2, "0")}:${String(date.S).padStart(2, "0")}+08:00`;
    }
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
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
    console.warn(`⚠️  Sheet "${name}" not found. Available: ${workbook.SheetNames.join(", ")}`);
    return [];
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

// ── Locations ─────────────────────────────────────────────

async function migrateLocations(workbook: XLSX.WorkBook): Promise<Map<string, string>> {
  const rows = getSheet(workbook, "Locations");
  console.log(`\n📍 Migrating ${rows.length} stock locations...`);

  const codeToId = new Map<string, string>();

  // Load existing locations
  const { data: existing } = await supabase.from("stock_locations").select("id, code");
  for (const loc of existing ?? []) {
    codeToId.set(loc.code.toUpperCase(), loc.id);
  }

  let updated = 0;
  let inserted = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const code = str(r["Location_ID"] || r["Code"] || r["code"]);
    if (!code) continue;

    const data = {
      code: code.toUpperCase(),
      name: str(r["Name"] || r["name"]) ?? code,
      type: str(r["Type"] || r["type"]) ?? "tank",
      capacity_liters: num(r["Capacity"] || r["capacity_liters"]) ? Math.round(num(r["Capacity"] || r["capacity_liters"])!) : null,
      initial_balance: num(r["Initial_Balance"] || r["initial_balance"]) ?? 0,
      current_balance: num(r["Current_Balance"] || r["current_balance"]) ?? num(r["Initial_Balance"] || r["initial_balance"]) ?? 0,
      low_threshold: num(r["Low_Threshold"] || r["low_threshold"]) ?? null,
      owner: str(r["Owner"] || r["owner"]) ?? "Company",
    };

    const existingId = codeToId.get(code.toUpperCase());
    if (existingId) {
      // Update existing location with xlsx data
      await supabase.from("stock_locations").update(data).eq("id", existingId);
      updated++;
    } else {
      const { data: inserted_data, error } = await supabase
        .from("stock_locations")
        .insert(data)
        .select("id")
        .single();
      if (error) {
        console.error(`  ❌ Location "${code}": ${error.message}`);
      } else if (inserted_data) {
        codeToId.set(code.toUpperCase(), inserted_data.id);
        inserted++;
      }
    }
  }

  // Re-fetch all locations to ensure map is complete
  const { data: all } = await supabase.from("stock_locations").select("id, code");
  for (const loc of all ?? []) {
    codeToId.set(loc.code.toUpperCase(), loc.id);
  }

  console.log(`  ✅ Locations: ${inserted} new, ${updated} updated, ${codeToId.size} total`);
  return codeToId;
}

// ── Transactions ──────────────────────────────────────────

async function migrateTransactions(
  workbook: XLSX.WorkBook,
  locationMap: Map<string, string>
) {
  const rows = getSheet(workbook, "Transactions");
  console.log(`\n📊 Migrating ${rows.length} stock transactions...`);

  const BATCH_SIZE = 100;
  let imported = 0;
  let skipped = 0;
  const batch: object[] = [];

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;

    const txDate = parseExcelDateTime(r["Date"] || r["Transaction_Date"] || r["transaction_date"]);
    if (!txDate) { skipped++; continue; }

    const type = str(r["Type"] || r["type"])?.toLowerCase();
    if (!type || !["purchase", "sale", "transfer", "adjustment"].includes(type)) {
      skipped++;
      continue;
    }

    const sourceCode = str(r["Source"] || r["Source_Location"] || r["source_location_id"])?.toUpperCase();
    const destCode = str(r["Destination"] || r["Dest_Location"] || r["dest_location_id"])?.toUpperCase();
    const sourceId = sourceCode ? locationMap.get(sourceCode) ?? null : null;
    const destId = destCode ? locationMap.get(destCode) ?? null : null;

    batch.push({
      transaction_date: txDate,
      type,
      source_location_id: sourceId,
      dest_location_id: destId,
      quantity_liters: num(r["Quantity"] || r["Quantity_Liters"] || r["quantity_liters"]),
      price_per_liter: num(r["Price"] || r["Price_Per_Liter"] || r["price_per_liter"]),
      customer_name: str(r["Customer"] || r["Customer_Name"] || r["customer_name"]),
      reference: str(r["Reference"] || r["reference"]),
      owner: str(r["Owner"] || r["owner"]) ?? "Company",
      notes: str(r["Notes"] || r["notes"]),
      running_total_qty: num(r["Running_Total_Qty"] || r["running_total_qty"]),
      running_total_value: num(r["Running_Total_Value"] || r["running_total_value"]),
      running_avg_cost: num(r["Running_Avg_Cost"] || r["running_avg_cost"]),
    });

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from("stock_transactions").insert(batch);
      if (error) {
        console.error(`  ❌ Batch error at ~${imported + skipped}: ${error.message}`);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
      process.stdout.write(`  ⏳ ${imported} transactions imported...\r`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from("stock_transactions").insert(batch);
    if (error) {
      console.error(`  ❌ Final batch error: ${error.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  console.log(`\n  ✅ Transactions: ${imported} imported, ${skipped} skipped`);
}

// ── Stock History ─────────────────────────────────────────

async function migrateHistory(
  workbook: XLSX.WorkBook,
  locationMap: Map<string, string>
) {
  const rows = getSheet(workbook, "Daily_Stock_History");
  if (rows.length === 0) {
    console.log("\n📉 No stock history sheet found (skipping)");
    return;
  }
  console.log(`\n📉 Migrating ${rows.length} stock history records...`);

  const BATCH_SIZE = 200;
  let imported = 0;
  let skipped = 0;
  const batch: object[] = [];

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;

    const date = parseExcelDate(r["Date"] || r["date"]);
    if (!date) { skipped++; continue; }

    const locCode = str(r["Location"] || r["Location_ID"] || r["location_id"])?.toUpperCase();
    const locId = locCode ? locationMap.get(locCode) ?? null : null;
    if (!locId) { skipped++; continue; }

    batch.push({
      date,
      location_id: locId,
      closing_balance: num(r["Closing_Balance"] || r["closing_balance"]),
      company_qty: num(r["Company_Qty"] || r["company_qty"]),
      company_value: num(r["Company_Value"] || r["company_value"]),
      partner_qty: num(r["Partner_Qty"] || r["partner_qty"]),
      partner_value: num(r["Partner_Value"] || r["partner_value"]),
    });

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from("stock_history").insert(batch);
      if (error) {
        console.error(`  ❌ History batch error: ${error.message}`);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
      process.stdout.write(`  ⏳ ${imported} history records...\r`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from("stock_history").insert(batch);
    if (error) {
      console.error(`  ❌ Final history batch error: ${error.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  console.log(`\n  ✅ History: ${imported} imported, ${skipped} skipped`);
}

// ── Stock Takes ───────────────────────────────────────────

async function migrateStockTakes(
  workbook: XLSX.WorkBook,
  locationMap: Map<string, string>
) {
  const rows = getSheet(workbook, "Stock_Takes");
  if (rows.length === 0) {
    console.log("\n📏 No stock takes sheet found (skipping)");
    return;
  }
  console.log(`\n📏 Migrating ${rows.length} stock takes...`);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;

    const date = parseExcelDate(r["Date"] || r["date"]);
    if (!date) { skipped++; continue; }

    const locCode = str(r["Location"] || r["Location_ID"] || r["location_id"])?.toUpperCase();
    const locId = locCode ? locationMap.get(locCode) ?? null : null;
    if (!locId) { skipped++; continue; }

    const measured = num(r["Measured"] || r["Measured_Liters"] || r["measured_liters"]);
    const system = num(r["System"] || r["System_Liters"] || r["system_liters"]);
    const variance = measured != null && system != null ? measured - system : num(r["Variance"] || r["variance"]);

    const { error } = await supabase.from("stock_takes").insert({
      date,
      location_id: locId,
      measured_liters: measured,
      system_liters: system,
      variance,
      notes: str(r["Notes"] || r["notes"]),
    });

    if (error) {
      console.error(`  ❌ Stock take ${date} ${locCode}: ${error.message}`);
      skipped++;
    } else {
      imported++;
    }
  }

  console.log(`  ✅ Stock Takes: ${imported} imported, ${skipped} skipped`);
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log("🚀 TKO Central — Stock Data Migration");
  console.log(`📁 Reading: ${XLSX_PATH}`);
  console.log(`🔗 Supabase: ${SUPABASE_URL}`);

  const workbook = XLSX.readFile(XLSX_PATH);
  console.log(`📊 Sheets: ${workbook.SheetNames.join(", ")}`);

  const locationMap = await migrateLocations(workbook);
  await migrateTransactions(workbook, locationMap);
  await migrateHistory(workbook, locationMap);
  await migrateStockTakes(workbook, locationMap);

  console.log("\n" + "═".repeat(50));
  console.log("✅ Stock migration complete!");
  console.log(`   Locations:    ${locationMap.size}`);
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
