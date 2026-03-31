"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Order } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function DriverOrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const { driverProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Default: this month
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(now.toISOString().split("T")[0]);

  const load = useCallback(async () => {
    if (!driverProfile?.id) return;
    setLoading(true);

    const { data } = await supabase
      .from("orders")
      .select("*, customer:customers!orders_customer_id_fkey(id, name)")
      .eq("driver_id", driverProfile.id)
      .gte("order_date", dateFrom)
      .lte("order_date", dateTo)
      .order("order_date", { ascending: false });

    if (data) setOrders(data);
    setLoading(false);
  }, [supabase, driverProfile, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/driver">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#1A3A5C]">My Orders</h1>
      </div>

      <div className="flex gap-2">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="flex-1"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="flex-1"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No orders for this period</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{o.customer?.name ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">{o.destination || "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(o.order_date).toLocaleDateString("en-MY")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{o.quantity_liters?.toLocaleString() ?? 0}L</p>
                    <Badge className={STATUS_COLORS[o.status] ?? ""} variant="secondary">
                      {o.status}
                    </Badge>
                  </div>
                </div>
                {(o.wages || o.allowance) && (
                  <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex gap-4">
                    {o.wages ? <span>Wages: RM {o.wages.toFixed(2)}</span> : null}
                    {o.allowance ? <span>Allowance: RM {o.allowance.toFixed(2)}</span> : null}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
