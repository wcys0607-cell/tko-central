import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getRecipients, filterByDocType } from "@/lib/notification-recipients";

/**
 * Notify recipients when a fleet document is updated/renewed.
 * Recipients and their doc_type preferences are configured in
 * Settings > App Configuration > FLEET_UPDATE_RECIPIENTS.
 */
export async function POST(req: NextRequest) {
  try {
    const { plateNumber, docType, expiryDate } = await req.json();

    if (!plateNumber || !docType) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const allRecipients = await getRecipients(supabase, "FLEET_UPDATE_RECIPIENTS");
    const recipients = filterByDocType(allRecipients, docType);

    if (recipients.length === 0) {
      return NextResponse.json({ message: "No recipients for this doc type", sent: 0 });
    }

    const formattedExpiry = expiryDate
      ? new Date(expiryDate).toLocaleDateString("en-MY", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "N/A";

    const message = [
      `✅ *Update Notification* ✅`,
      `----------------`,
      `🚛 Truck: ${plateNumber}`,
      `📄 Document: ${docType} (Updated)`,
      `📅 New Expiry: ${formattedExpiry}`,
      `----------------`,
      docType === "Puspakom"
        ? `Puspakom has been renewed. You may proceed with Road Tax / Insurance renewal.`
        : `Document has been renewed.`,
    ].join("\n");

    for (const r of recipients) {
      await sendWhatsApp({
        phone: r.phone,
        message,
        type: "fleet_update",
        recipientName: r.name,
      });
    }

    return NextResponse.json({ message: "Notification sent", sent: recipients.length });
  } catch (err) {
    console.error("Fleet notify-update error:", err);
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}
