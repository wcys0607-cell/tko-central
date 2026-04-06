"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { Order } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { ArrowLeft, Lock, MessageSquare } from "lucide-react";
import { format, addDays, isToday, isTomorrow, isYesterday } from "date-fns";
import { toast } from "sonner";

/** Get date range: 1st of previous month → today/tomorrow (with weekend logic) */
function getDateRange(): { from: string; to: string } {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat

  // "from" is always the 1st of the previous month
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const from = format(prevMonth, "yyyy-MM-dd");

  if (hour >= 19) {
    let daysAhead = 1; // Mon–Fri: tomorrow
    if (day === 6) daysAhead = 2;       // Sat → Mon
    else if (day === 0) daysAhead = 1;  // Sun → Mon
    const to = addDays(now, daysAhead);
    return { from, to: format(to, "yyyy-MM-dd") };
  } else {
    return { from, to: format(now, "yyyy-MM-dd") };
  }
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, d MMM");
}

/** Check if driver_remark is editable for a given order date */
function isRemarkEditable(orderDate: string): boolean {
  const now = new Date();
  const oDate = new Date(orderDate + "T00:00:00");
  const orderMonth = oDate.getMonth();
  const orderYear = oDate.getFullYear();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Same month → always editable
  if (orderYear === currentYear && orderMonth === currentMonth) return true;

  // Previous month → check grace period
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  if (orderYear === prevYear && orderMonth === prevMonth) {
    const lastDayOfOrderMonth = new Date(orderYear, orderMonth + 1, 0).getDate();
    const orderDay = oDate.getDate();
    if (orderDay >= lastDayOfOrderMonth - 1 && now.getDate() <= 2) {
      return true;
    }
  }

  return false;
}

export default function DriverOrdersPage() {
  const { driverProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const originalRemarks = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!driverProfile?.id) return;
    setLoading(true);

    const { from, to } = getDateRange();

    try {
      const res = await fetch(`/api/driver/orders?driver_id=${driverProfile.id}&from=${from}&to=${to}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
        // Initialize remark drafts
        const drafts: Record<string, string> = {};
        const originals: Record<string, string> = {};
        for (const o of data) {
          drafts[o.id] = o.driver_remark ?? "";
          originals[o.id] = o.driver_remark ?? "";
        }
        setRemarkDrafts(drafts);
        originalRemarks.current = originals;
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [driverProfile]);

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

  // Group orders by month
  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const d = new Date(o.order_date + "T00:00:00");
      const key = format(d, "yyyy-MM");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    // Sort months descending (newest first)
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);

  const saveRemark = useCallback(async (orderId: string) => {
    const draft = remarkDrafts[orderId] ?? "";
    const original = originalRemarks.current[orderId] ?? "";
    if (draft === original) return; // No change

    setSavingIds((prev) => new Set(prev).add(orderId));
    try {
      const res = await fetch("/api/driver/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, driver_remark: draft || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save remark");
        // Revert
        setRemarkDrafts((prev) => ({ ...prev, [orderId]: original }));
      } else {
        originalRemarks.current[orderId] = draft;
        toast.success("Remark saved");
      }
    } catch {
      toast.error("Failed to save remark");
      setRemarkDrafts((prev) => ({ ...prev, [orderId]: original }));
    }
    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  }, [remarkDrafts]);

  const { from, to } = getDateRange();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 animate-fade-in">
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
        <div className="space-y-5">
          {grouped.map(([monthKey, monthOrders]) => {
            const monthDate = new Date(monthKey + "-01T00:00:00");
            const monthLabel = format(monthDate, "MMMM yyyy");

            return (
              <div key={monthKey}>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-sm font-bold text-primary">{monthLabel}</h2>
                  <Badge variant="secondary" className="text-[10px]">{monthOrders.length}</Badge>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="h-6 px-1.5 text-[11px]">Date</TableHead>
                          <TableHead className="h-6 px-1.5 text-[11px]">Customer</TableHead>
                          <TableHead className="h-6 px-1.5 text-[11px]">Address</TableHead>
                          <TableHead className="h-6 px-1.5 text-[11px] text-right">Qty</TableHead>
                          <TableHead className="h-6 px-1.5 text-[11px]">Remark</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthOrders.map((o) => {
                          const cust = o.customer as { name: string; short_name?: string | null } | null;
                          const custName = cust?.short_name || cust?.name || "—";
                          const items = (o.items ?? []) as unknown as { product_id: string; quantity_liters: number; product: { name: string } | null }[];
                          const dieselItem = items.find((i) => (i.product?.name ?? "").toUpperCase().includes("DIESEL"));
                          const ltItem = items.find((i) => (i.product?.name ?? "").toUpperCase().includes("(LT)"));
                          const qty = dieselItem?.quantity_liters ?? ltItem?.quantity_liters ?? o.quantity_liters;
                          const editable = isRemarkEditable(o.order_date);

                          return (
                            <TableRow key={o.id}>
                              <TableCell className="py-0.5 px-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                                {dateLabel(o.order_date)}
                              </TableCell>
                              <TableCell className="py-0.5 px-1.5 text-[11px] font-medium whitespace-nowrap">
                                {custName}
                              </TableCell>
                              <TableCell className="py-0.5 px-1.5 text-[11px] text-muted-foreground max-w-[120px] truncate">
                                {o.destination ? o.destination.split("\n")[0] : "—"}
                              </TableCell>
                              <TableCell className="py-0.5 px-1.5 text-[11px] text-right font-semibold whitespace-nowrap">
                                {qty ? Number(qty).toLocaleString() : "—"}
                              </TableCell>
                              <TableCell className="py-0.5 px-1.5 text-[11px]">
                                <div className="flex items-center gap-1">
                                  {editable ? (
                                    <MessageSquare className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                  ) : (
                                    <Lock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                  )}
                                  <Input
                                    placeholder={editable ? "Remark..." : ""}
                                    value={remarkDrafts[o.id] ?? ""}
                                    disabled={!editable || savingIds.has(o.id)}
                                    onChange={(e) =>
                                      setRemarkDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))
                                    }
                                    onBlur={() => saveRemark(o.id)}
                                    className="h-5 text-[11px] min-w-[60px] px-1"
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
