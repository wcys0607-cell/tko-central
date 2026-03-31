import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().split("T")[0];

  // Get all fleet documents with vehicle info
  const { data: docs } = await supabase
    .from("fleet_documents")
    .select("*, vehicle:vehicles!fleet_documents_vehicle_id_fkey(id, plate_number)")
    .not("expiry_date", "is", null);

  if (!docs || docs.length === 0) {
    return NextResponse.json({ message: "No documents to check", alerts: 0 });
  }

  let updatedCount = 0;
  let alertCount = 0;

  for (const doc of docs) {
    const expiryDate = new Date(doc.expiry_date);
    const todayDate = new Date(today);
    const daysRemaining = Math.ceil(
      (expiryDate.getTime() - todayDate.getTime()) / 86400000
    );

    let status = "valid";
    if (daysRemaining < 0) status = "expired";
    else if (daysRemaining <= 30) status = "expiring_soon";

    // Update days_remaining and status
    await supabase
      .from("fleet_documents")
      .update({ days_remaining: daysRemaining, status })
      .eq("id", doc.id);
    updatedCount++;

    // Send alerts for documents expiring within 30 days and not already alerted
    if (daysRemaining <= 30 && !doc.alert_sent) {
      const plateNumber = doc.vehicle?.plate_number ?? "Unknown";
      const message = [
        `🚨 *Document Expiry Alert* 🚨`,
        `🚛 Truck: ${plateNumber}`,
        `📄 Document: ${doc.doc_type}`,
        `📅 Expiry: ${expiryDate.toLocaleDateString("en-MY")}`,
        `⏳ Days Left: ${daysRemaining < 0 ? "EXPIRED" : daysRemaining}`,
        `Please arrange for renewal.`,
      ].join("\n");

      // Determine recipients based on doc type
      const recipients: { phone: string; name: string }[] = [
        { phone: "60175502007", name: "Wilson" },
        { phone: "60127681224", name: "Nelson" },
      ];

      // Ck Chen only gets Road Tax and Insurance alerts
      if (doc.doc_type === "Road Tax" || doc.doc_type === "Insurance") {
        recipients.push({ phone: "60137535544", name: "Ck Chen" });
      }

      for (const r of recipients) {
        await sendWhatsApp({
          phone: r.phone,
          message,
          type: "fleet_expiry",
          recipientName: r.name,
          referenceId: doc.id,
        });
      }

      // Mark as alerted
      await supabase
        .from("fleet_documents")
        .update({ alert_sent: true, last_alert_date: today })
        .eq("id", doc.id);

      alertCount++;
    }
  }

  return NextResponse.json({
    message: `Updated ${updatedCount} documents, sent ${alertCount} alerts`,
    updated: updatedCount,
    alerts: alertCount,
  });
}
