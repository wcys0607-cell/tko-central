/**
 * TKO Central — Fleet Data Migration Script
 * Reads "TKO_Fleet_Database.xlsx" and imports: vehicles, documents, maintenance_logs, driver_checklists, driver updates
 *
 * Usage:
 *   npx tsx scripts/migrate-fleet.ts
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const XLSX_PATH = path.join(__dirname, "..", "..", "TKO_Fleet_Database.xlsx");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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
    console.warn(`⚠️  Sheet "${name}" not found`);
    return [];
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

// ── Vehicles ──────────────────────────────────────────────

async function migrateVehicles(workbook: XLSX.WorkBook): Promise<Map<string, string>> {
  const rows = getSheet(workbook, "Vehicles");
  console.log(`\n🚛 Migrating ${rows.length} vehicles...`);

  const plateToId = new Map<string, string>();

  // Load existing vehicles
  const { data: existing } = await supabase.from("vehicles").select("id, plate_number");
  for (const v of existing ?? []) {
    plateToId.set(v.plate_number.toUpperCase(), v.id);
  }

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const truckNo = str(r["Truck_No"]);
    if (!truckNo) continue;

    const plate = truckNo.toUpperCase();
    const ownerRaw = str(r["Owner"]);
    const owner = ownerRaw?.toLowerCase().includes("partner") ? "Partner" : "Company";
    const model = str(r["Model"]);
    const capacity = num(r["Quantity(L)"]);

    // Determine vehicle type from model
    let type: string | null = null;
    if (model) {
      const m = model.toLowerCase();
      if (m.includes("trailer")) type = "Trailer";
      else if (m.includes("excavator")) type = "Excavator";
      else if (m.includes("car") || m.includes("hilux") || m.includes("viva") || m.includes("myvi")) type = "Car";
      else if (m.includes("mini")) type = "Mini Tanker";
      else type = "Road Tanker";
    }

    const existingId = plateToId.get(plate);
    if (existingId) {
      // Update with fleet data
      await supabase.from("vehicles").update({
        type: type ?? undefined,
        capacity_liters: capacity ? Math.round(capacity) : undefined,
        owner,
      }).eq("id", existingId);
      updated++;
    } else {
      const { data, error } = await supabase.from("vehicles").insert({
        plate_number: plate,
        type,
        capacity_liters: capacity ? Math.round(capacity) : null,
        owner,
        is_active: true,
      }).select("id").single();

      if (error) {
        console.error(`  ❌ Vehicle "${plate}": ${error.message}`);
      } else if (data) {
        plateToId.set(plate, data.id);
        inserted++;
      }
    }
  }

  // Re-fetch all
  const { data: all } = await supabase.from("vehicles").select("id, plate_number");
  for (const v of all ?? []) {
    plateToId.set(v.plate_number.toUpperCase(), v.id);
  }

  console.log(`  ✅ Vehicles: ${inserted} new, ${updated} updated, ${plateToId.size} total`);
  return plateToId;
}

// ── Users / Drivers ───────────────────────────────────────

async function migrateUsers(
  workbook: XLSX.WorkBook,
  vehicleMap: Map<string, string>
): Promise<Map<string, string>> {
  const rows = getSheet(workbook, "User");
  console.log(`\n👤 Migrating ${rows.length} users...`);

  const nameToId = new Map<string, string>();

  // Load existing drivers
  const { data: existing } = await supabase.from("drivers").select("id, name, email");
  for (const d of existing ?? []) {
    nameToId.set(d.name.toUpperCase(), d.id);
    if (d.email) nameToId.set(d.email.toUpperCase(), d.id);
  }

  let updated = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const email = str(r["User Email"]);
    const driverName = str(r["Driver Name"]);
    const phone = str(r["Contact (HP)"]);
    const truck1 = str(r["Truck1"])?.toUpperCase();

    if (!email) continue;

    // Try to match by email first, then by name
    let driverId = nameToId.get(email.toUpperCase());
    if (!driverId && driverName) {
      driverId = nameToId.get(driverName.toUpperCase());
    }

    if (driverId) {
      const updateData: Record<string, unknown> = {};
      if (phone) updateData.phone = phone;
      if (email) updateData.email = email;
      if (truck1 && vehicleMap.has(truck1)) {
        updateData.assigned_vehicle_id = vehicleMap.get(truck1);
      }
      if (Object.keys(updateData).length > 0) {
        await supabase.from("drivers").update(updateData).eq("id", driverId);
        updated++;
      }
    }
  }

  console.log(`  ✅ Users: ${updated} updated`);
  return nameToId;
}

// ── Documents ─────────────────────────────────────────────

async function migrateDocuments(
  workbook: XLSX.WorkBook,
  vehicleMap: Map<string, string>
) {
  const rows = getSheet(workbook, "Documents");
  const archivedRows = getSheet(workbook, "Archived");
  const allRows = [...rows, ...archivedRows];
  console.log(`\n📄 Migrating ${allRows.length} documents (${rows.length} active + ${archivedRows.length} archived)...`);

  let imported = 0;
  let skipped = 0;

  // Check existing count
  const { count: existingCount } = await supabase
    .from("fleet_documents")
    .select("id", { count: "exact", head: true });

  if ((existingCount ?? 0) > 0) {
    console.log(`  ⚠️  ${existingCount} documents already exist, skipping migration`);
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  for (const row of allRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const truckRef = str(r["Truck_Ref"])?.toUpperCase();
    if (!truckRef) { skipped++; continue; }

    const vehicleId = vehicleMap.get(truckRef);
    if (!vehicleId) {
      // Try partial match (e.g., "JJD335" from "JJD335-T/J8168")
      let found: string | null = null;
      for (const [plate, vid] of vehicleMap) {
        if (plate.startsWith(truckRef) || truckRef.startsWith(plate)) {
          found = vid;
          break;
        }
      }
      if (!found) { skipped++; continue; }
    }

    const finalVehicleId = vehicleId ?? (() => {
      for (const [plate, vid] of vehicleMap) {
        if (plate.startsWith(truckRef) || truckRef.startsWith(plate)) return vid;
      }
      return null;
    })();

    if (!finalVehicleId) { skipped++; continue; }

    const expiryDate = parseExcelDate(r["Expiry_Date"]);
    const docType = str(r["Document_Type"]);
    if (!docType) { skipped++; continue; }

    let daysRemaining: number | null = null;
    let status = "valid";
    if (expiryDate) {
      daysRemaining = Math.ceil(
        (new Date(expiryDate).getTime() - new Date(today).getTime()) / 86400000
      );
      if (daysRemaining < 0) status = "expired";
      else if (daysRemaining <= 30) status = "expiring_soon";
    }

    const { error } = await supabase.from("fleet_documents").insert({
      vehicle_id: finalVehicleId,
      doc_type: docType,
      expiry_date: expiryDate,
      days_remaining: daysRemaining,
      status,
      alert_sent: false,
    });

    if (error) {
      console.error(`  ❌ Doc ${truckRef}/${docType}: ${error.message}`);
      skipped++;
    } else {
      imported++;
    }
  }

  console.log(`  ✅ Documents: ${imported} imported, ${skipped} skipped`);
}

// ── Maintenance Logs ──────────────────────────────────────

async function migrateMaintenanceLogs(
  workbook: XLSX.WorkBook,
  vehicleMap: Map<string, string>
) {
  const rows = getSheet(workbook, "Maintenance_Logs");
  console.log(`\n🔧 Migrating ${rows.length} maintenance logs...`);

  // Check existing
  const { count: existingCount } = await supabase
    .from("maintenance_logs")
    .select("id", { count: "exact", head: true });

  if ((existingCount ?? 0) > 0) {
    console.log(`  ⚠️  ${existingCount} logs already exist, skipping migration`);
    return;
  }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const truckRef = str(r["Truck_Ref"])?.toUpperCase();
    if (!truckRef) { skipped++; continue; }

    const vehicleId = vehicleMap.get(truckRef);
    if (!vehicleId) { skipped++; continue; }

    const serviceDate = parseExcelDate(r["Date"]);
    if (!serviceDate) { skipped++; continue; }

    const { error } = await supabase.from("maintenance_logs").insert({
      vehicle_id: vehicleId,
      service_date: serviceDate,
      odometer: num(r["Odometer_Reading"]) ? Math.round(num(r["Odometer_Reading"])!) : null,
      service_type: str(r["Service_Type"]),
      next_service_odo: num(r["Next_Service_Due_KM"]) ? Math.round(num(r["Next_Service_Due_KM"])!) : null,
      mechanic: str(r["Mechanic_Name"]),
      cost: num(r["Cost"]),
      gps_location: str(r["GPS_Reading"])?.toString(),
      notes: str(r["Remarks"]),
    });

    if (error) {
      console.error(`  ❌ Maint ${truckRef}/${serviceDate}: ${error.message}`);
      skipped++;
    } else {
      imported++;
    }
  }

  console.log(`  ✅ Maintenance Logs: ${imported} imported, ${skipped} skipped`);
}

// ── Driver Checklists ─────────────────────────────────────

async function migrateChecklists(
  workbook: XLSX.WorkBook,
  vehicleMap: Map<string, string>
) {
  const rows = getSheet(workbook, "Driver_Checklists");
  console.log(`\n📋 Migrating ${rows.length} driver checklists...`);

  // Check existing
  const { count: existingCount } = await supabase
    .from("driver_checklists")
    .select("id", { count: "exact", head: true });

  if ((existingCount ?? 0) > 0) {
    console.log(`  ⚠️  ${existingCount} checklists already exist, skipping migration`);
    return;
  }

  // Load drivers for name/email lookup
  const { data: drivers } = await supabase.from("drivers").select("id, name, email");
  const driverLookup = new Map<string, string>();
  for (const d of drivers ?? []) {
    driverLookup.set(d.name.toUpperCase(), d.id);
    if (d.email) driverLookup.set(d.email.toUpperCase(), d.id);
  }

  const BATCH_SIZE = 100;
  let imported = 0;
  let skipped = 0;
  const batch: object[] = [];

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const truckRef = str(r["Truck_Ref"])?.toUpperCase();
    if (!truckRef) { skipped++; continue; }

    const vehicleId = vehicleMap.get(truckRef);
    if (!vehicleId) { skipped++; continue; }

    const checkDate = parseExcelDateTime(r["Date_Time"]);
    if (!checkDate) { skipped++; continue; }

    // Driver lookup by email (Driver_Name column contains email in this sheet)
    const driverEmail = str(r["Driver_Name"])?.toUpperCase();
    const driverId = driverEmail ? driverLookup.get(driverEmail) ?? null : null;

    const isGood = (val: unknown) => str(val)?.toLowerCase() === "good";
    const hasIssues = str(r["Issues_Found"]);

    batch.push({
      driver_id: driverId,
      vehicle_id: vehicleId,
      check_date: checkDate,
      odometer: num(r["Current_Odometer"]) ? Math.round(num(r["Current_Odometer"])!) : null,
      tyres_ok: isGood(r["Tyres_Condition"]),
      brakes_ok: isGood(r["Brakes"]),
      engine_oil_ok: isGood(r["Engine_Oil_Level"]),
      coolant_ok: isGood(r["Coolant_Water"]),
      lights_ok: isGood(r["Lights"]),
      fire_extinguisher_ok: isGood(r["Fire_Extinguisher"]),
      has_defect: !!hasIssues,
      defect_details: hasIssues,
    });

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from("driver_checklists").insert(batch);
      if (error) {
        console.error(`  ❌ Batch error at ~${imported + skipped}: ${error.message}`);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
      process.stdout.write(`  ⏳ ${imported} checklists imported...\r`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from("driver_checklists").insert(batch);
    if (error) {
      console.error(`  ❌ Final batch error: ${error.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  console.log(`\n  ✅ Checklists: ${imported} imported, ${skipped} skipped`);
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log("🚀 TKO Central — Fleet Data Migration");
  console.log(`📁 Reading: ${XLSX_PATH}`);

  const workbook = XLSX.readFile(XLSX_PATH);
  console.log(`📊 Sheets: ${workbook.SheetNames.join(", ")}`);

  const vehicleMap = await migrateVehicles(workbook);
  await migrateUsers(workbook, vehicleMap);
  await migrateDocuments(workbook, vehicleMap);
  await migrateMaintenanceLogs(workbook, vehicleMap);
  await migrateChecklists(workbook, vehicleMap);

  console.log("\n" + "═".repeat(50));
  console.log("✅ Fleet migration complete!");
  console.log(`   Vehicles:  ${vehicleMap.size}`);
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
