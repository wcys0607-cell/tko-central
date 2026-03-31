import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncInvoiceStatus } from "@/lib/bukku/invoices";
import { syncBukkuContacts } from "@/lib/bukku/contacts";
import { syncBukkuProducts } from "@/lib/bukku/products";

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

  const results: Record<string, unknown> = {};

  // Always sync invoice status (runs every 15 min)
  const invoiceResult = await syncInvoiceStatus();
  results.invoices = invoiceResult;

  await supabase.from("notifications_log").insert({
    type: "bukku_sync_invoices",
    message: `Cron: ${invoiceResult.updated} updated, ${invoiceResult.overdue} overdue, ${invoiceResult.failed} failed`,
    status: invoiceResult.failed === 0 ? "sent" : "failed",
    sent_at: new Date().toISOString(),
  });

  // Check if it's ~2am Malaysia time (UTC+8) — run daily contact/product sync
  const now = new Date();
  const malaysiaHour = (now.getUTCHours() + 8) % 24;

  if (malaysiaHour >= 1 && malaysiaHour <= 3) {
    const contactResult = await syncBukkuContacts();
    results.contacts = contactResult;

    await supabase.from("notifications_log").insert({
      type: "bukku_sync_contacts",
      message: `Cron: ${contactResult.matched} matched, ${contactResult.created} created, ${contactResult.failed} failed`,
      status: contactResult.failed === 0 && contactResult.errors.length === 0 ? "sent" : "failed",
      sent_at: new Date().toISOString(),
    });

    const productResult = await syncBukkuProducts();
    results.products = productResult;

    await supabase.from("notifications_log").insert({
      type: "bukku_sync_products",
      message: `Cron: ${productResult.matched} matched, ${productResult.created} created, ${productResult.failed} failed`,
      status: productResult.failed === 0 && productResult.errors.length === 0 ? "sent" : "failed",
      sent_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ message: "Bukku sync complete", results });
}
