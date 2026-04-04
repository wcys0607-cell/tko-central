import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const { user, error, status } = await getAuthenticatedUser(["admin", "manager", "office"]);
  if (!user) return NextResponse.json({ error }, { status: status ?? 401 });

  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get order to find the PDF path
  const { data: order } = await admin
    .from("orders")
    .select("bukku_so_id, bukku_so_number")
    .eq("id", orderId)
    .single();

  if (!order?.bukku_so_id) {
    return NextResponse.json({ error: "No Bukku SO for this order" }, { status: 404 });
  }

  const fileName = `so/${orderId}/${order.bukku_so_number || order.bukku_so_id}.pdf`;

  // Try to get from storage
  const { data: fileData, error: dlError } = await admin.storage
    .from("bukku-docs")
    .download(fileName);

  if (dlError || !fileData) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }

  const buffer = await fileData.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${order.bukku_so_number || order.bukku_so_id}.pdf"`,
    },
  });
}
