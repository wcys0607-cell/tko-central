import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the user has a valid driver record
  const { data: driverRecord } = await supabase
    .from("drivers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!driverRecord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    vehicleId,
    plateNumber,
    driverName,
    odometer,
    hasDefect,
    defectDetails,
  } = body;

  const alerts: string[] = [];

  // Check ODO against maintenance logs for this vehicle
  if (vehicleId && odometer) {
    const { data: logs } = await supabase
      .from("maintenance_logs")
      .select("service_type, next_service_odo")
      .eq("vehicle_id", vehicleId)
      .not("next_service_odo", "is", null);

    for (const log of logs ?? []) {
      if (log.next_service_odo && odometer >= log.next_service_odo) {
        const msg = [
          `🚨 *TKO Fleet Alert*`,
          `🚛 Truck: ${plateNumber}`,
          `👤 Driver: ${driverName}`,
          `🔢 ODO: ${odometer.toLocaleString()}`,
          `⚠️ [${log.service_type}] Due! (Limit: ${log.next_service_odo.toLocaleString()})`,
          `Please verify immediately.`,
        ].join("\n");

        // Send to Nelson and Fook
        for (const phone of ["60127681224", "60197260488"]) {
          await sendWhatsApp({
            phone,
            message: msg,
            type: "maintenance_due",
            recipientName: phone === "60127681224" ? "Nelson" : "Fook",
            referenceId: vehicleId,
          });
        }
        alerts.push(`${log.service_type} overdue`);
      }
    }
  }

  // Defect alert
  if (hasDefect) {
    const msg = [
      `🚨 *TKO Fleet Alert*`,
      `🚛 Truck: ${plateNumber}`,
      `👤 Driver: ${driverName}`,
      `🛠️ *Condition Bad:*`,
      defectDetails || "No details provided",
      `Please verify immediately.`,
    ].join("\n");

    for (const phone of ["60127681224", "60197260488"]) {
      await sendWhatsApp({
        phone,
        message: msg,
        type: "vehicle_defect",
        recipientName: phone === "60127681224" ? "Nelson" : "Fook",
        referenceId: vehicleId,
      });
    }
    alerts.push("defect reported");
  }

  return NextResponse.json({ alerts });
}
