import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getRecipients, filterByDocType } from "@/lib/notification-recipients";

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

  // Get all fleet documents with vehicle info (exclude "Others" type vehicles)
  const { data: docs } = await supabase
    .from("fleet_documents")
    .select("*, vehicle:vehicles!fleet_documents_vehicle_id_fkey(id, plate_number, type)")
    .not("expiry_date", "is", null);

  // Filter out "Others" vehicles (CYL, SELF COLLECTION, etc.)
  const filteredDocs = (docs ?? []).filter(
    (d) => d.vehicle?.type !== "Others"
  );

  if (filteredDocs.length === 0) {
    return NextResponse.json({ message: "No documents to check", alerts: 0 });
  }

  let updatedCount = 0;
  let alertCount = 0;

  for (const doc of filteredDocs) {
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

    // Send alerts at 30 days and 7 days before expiry
    // alert_sent = first alert (30 days), last_alert_date tracks when last sent
    const shouldSend30Day = daysRemaining <= 30 && daysRemaining > 7 && !doc.alert_sent;
    const shouldSend7Day = daysRemaining <= 7 && daysRemaining >= 0 && doc.last_alert_date !== today
      && (!doc.last_alert_date || doc.last_alert_date < today);
    const shouldSendExpired = daysRemaining < 0 && doc.last_alert_date !== today
      && (!doc.last_alert_date || doc.last_alert_date < today) && !doc.alert_sent;

    if (shouldSend30Day || shouldSend7Day || shouldSendExpired) {
      const plateNumber = doc.vehicle?.plate_number ?? "Unknown";
      const urgency = daysRemaining < 0 ? "‼️ EXPIRED" : daysRemaining <= 7 ? "⚠️ URGENT" : "🚨 REMINDER";
      const message = [
        `${urgency} *Document Expiry Alert*`,
        `🚛 Vehicle: ${plateNumber}`,
        `📄 Document: ${doc.doc_type}`,
        `📅 Expiry: ${expiryDate.toLocaleDateString("en-MY")}`,
        `⏳ Days Left: ${daysRemaining < 0 ? "EXPIRED" : daysRemaining}`,
        daysRemaining <= 7 ? `*Please renew immediately.*` : `Please arrange for renewal.`,
      ].join("\n");

      // Determine recipients from app_config (filtered by doc type)
      const allRecipients = await getRecipients(supabase, "FLEET_EXPIRY_RECIPIENTS");
      const recipients = filterByDocType(allRecipients, doc.doc_type);

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
