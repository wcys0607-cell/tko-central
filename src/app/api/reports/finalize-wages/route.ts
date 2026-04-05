import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const { user, error, status } = await getAuthenticatedUser(["admin", "manager"]);
  if (!user) {
    return NextResponse.json({ error }, { status: status ?? 401 });
  }

  const body = await req.json();
  const { month, action } = body as { month?: string; action?: "finalize" | "unfinalize" };

  if (!month || !action) {
    return NextResponse.json({ error: "Missing month or action" }, { status: 400 });
  }

  // Validate month format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format" }, { status: 400 });
  }

  const [year, m] = month.split("-").map(Number);
  const firstDay = `${year}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(year, m, 0);
  const lastDayStr = `${year}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const supabase = createAdminClient();

  if (action === "finalize") {
    const { data, error: dbErr } = await supabase
      .from("orders")
      .update({ wages_finalized_at: new Date().toISOString() })
      .gte("order_date", firstDay)
      .lte("order_date", lastDayStr)
      .in("status", ["approved", "delivered"])
      .not("driver_id", "is", null)
      .is("wages_finalized_at", null)
      .select("id");

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ message: `Finalised ${data?.length ?? 0} orders for ${month}` });
  }

  if (action === "unfinalize") {
    const { data, error: dbErr } = await supabase
      .from("orders")
      .update({ wages_finalized_at: null })
      .gte("order_date", firstDay)
      .lte("order_date", lastDayStr)
      .not("wages_finalized_at", "is", null)
      .select("id");

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ message: `Unfinalised ${data?.length ?? 0} orders for ${month}` });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
