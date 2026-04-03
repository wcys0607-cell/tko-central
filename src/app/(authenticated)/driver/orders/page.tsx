"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Order } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, MapPin, Package } from "lucide-react";
import { format, subDays, addDays, isToday, isTomorrow, isYesterday } from "date-fns";

/** Get the 7-day window. After 7pm, extend to next day:
 *  Mon–Fri 7pm → tomorrow
 *  Sat 7pm → Monday
 *  Sun 7pm → Monday */
function getDateRange(): { from: string; to: string } {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat

  if (hour >= 19) {
    let daysAhead = 1; // Mon–Fri: tomorrow
    if (day === 6) daysAhead = 2;       // Sat → Mon
    else if (day === 0) daysAhead = 1;  // Sun → Mon

    const to = addDays(now, daysAhead);
    const from = subDays(now, 7 - daysAhead);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  } else {
    // Before 7pm: today + previous 6 days
    const to = now;
    const from = subDays(now, 6);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, d MMM");
}

export default function DriverOrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const { driverProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!driverProfile?.id) return;
    setLoading(true);

    const { from, to } = getDateRange();

    const { data } = await supabase
      .from("orders")
      .select(
        `*, customer:customers!orders_customer_id_fkey(id, name, short_name),
         items:order_items(product_id, quantity_liters, product:product_id(name))`
      )
      .eq("driver_id", driverProfile.id)
      .eq("status", "approved")
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: true });

    if (data) setOrders(data);
    setLoading(false);
  }, [supabase, driverProfile]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh at 7pm
  useEffect(() => {
    const now = new Date();
    const sevenPm = new Date(now);
    sevenPm.setHours(19, 0, 0, 0);
    const msUntil7pm = sevenPm.getTime() - now.getTime();

    if (msUntil7pm > 0 && msUntil7pm < 12 * 60 * 60 * 1000) {
      const timer = setTimeout(() => load(), msUntil7pm + 1000);
      return () => clearTimeout(timer);
    }
  }, [load]);

  // Group orders by date
  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const key = o.order_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [orders]);

  const { from, to } = getDateRange();

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/driver">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-primary">My Orders</h1>
          <p className="text-xs text-muted-foreground">
            {format(new Date(from + "T00:00:00"), "d MMM")} — {format(new Date(to + "T00:00:00"), "d MMM yyyy")}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No orders in this period</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, dayOrders]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-bold text-primary">{dateLabel(date)}</h2>
                <Badge variant="secondary" className="text-[10px]">{dayOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {dayOrders.map((o) => {
                  const cust = o.customer as { name: string; short_name?: string | null } | null;
                  const custName = cust?.short_name || cust?.name || "—";
                  const items = (o.items ?? []) as unknown as { product_id: string; quantity_liters: number; product: { name: string } | null }[];
                  const dieselItem = items.find((i) => (i.product?.name ?? "").toUpperCase().includes("DIESEL"));
                  const ltItem = items.find((i) => (i.product?.name ?? "").toUpperCase().includes("(LT)"));
                  const qty = dieselItem?.quantity_liters ?? ltItem?.quantity_liters ?? o.quantity_liters;

                  return (
                    <Card key={o.id}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{custName}</p>
                            {o.destination && (
                              <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                                <span className="line-clamp-2">{o.destination.split("\n")[0]}</span>
                              </p>
                            )}
                            {o.delivery_remark && (
                              <p className="text-xs text-muted-foreground mt-0.5 italic">
                                {o.delivery_remark}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-sm flex items-center gap-1 justify-end">
                              <Package className="w-3 h-3" />
                              {qty ? `${Number(qty).toLocaleString()}L` : "—"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
