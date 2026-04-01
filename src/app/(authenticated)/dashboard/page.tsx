"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";
import { useChartColors } from "@/hooks/use-css-var";
import Link from "next/link";
import {
  ClipboardList,
  Clock,
  DollarSign,
  Droplets,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";

interface DailyRevenue {
  date: string;
  label: string;
  revenue: number;
  liters: number;
  count: number;
}

interface TankLevel {
  code: string;
  name: string | null;
  current_balance: number | null;
  capacity_liters: number | null;
}

interface FleetAlert {
  id: string;
  vehicle_id: string;
  plate_number: string;
  doc_type: string;
  days_remaining: number | null;
  status: string | null;
}

interface RecentOrder {
  id: string;
  order_date: string;
  customer_name: string;
  quantity_liters: number | null;
  status: string;
}

export default function DashboardPage() {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);
  const { chart1, chart2 } = useChartColors();

  const [loading, setLoading] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [todayLiters, setTodayLiters] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [totalStock, setTotalStock] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  const [revenueData, setRevenueData] = useState<DailyRevenue[]>([]);
  const [tankLevels, setTankLevels] = useState<TankLevel[]>([]);
  const [fleetAlerts, setFleetAlerts] = useState<FleetAlert[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    const thirtyDaysAgo = d30.toISOString().split("T")[0];

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("quantity_liters, total_sale")
        .eq("order_date", today)
        .neq("status", "cancelled");
      if (error) { console.error("Dashboard: today orders error", error); }
      const orders = data ?? [];
      setTodayCount(orders.length);
      setTodayLiters(orders.reduce((s: number, o: { quantity_liters: number | null }) => s + (o.quantity_liters ?? 0), 0));
      setTodayRevenue(orders.reduce((s: number, o: { total_sale: number | null }) => s + (o.total_sale ?? 0), 0));
    } catch (e) { console.error("Dashboard: today orders exception", e); }

    try {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingCount(count ?? 0);
    } catch (e) { console.error("Dashboard: pending", e); }

    try {
      const { data } = await supabase
        .from("orders")
        .select("total_sale, bukku_payment_status")
        .not("bukku_invoice_id", "is", null);
      const outOrders = (data ?? []).filter(
        (o: { bukku_payment_status: string | null }) => o.bukku_payment_status !== "paid"
      );
      setOutstanding(outOrders.reduce((s: number, o: { total_sale: number | null }) => s + (o.total_sale ?? 0), 0));
      setOverdueCount(outOrders.filter((o: { bukku_payment_status: string | null }) => o.bukku_payment_status === "overdue").length);
    } catch (e) { console.error("Dashboard: outstanding", e); }

    try {
      const { data } = await supabase
        .from("stock_locations")
        .select("code, name, current_balance, capacity_liters, low_threshold, type")
        .eq("type", "tank");
      const tanks = (data ?? []) as (TankLevel & { low_threshold?: number | null })[];
      setTotalStock(tanks.reduce((s, t) => s + (t.current_balance ?? 0), 0));
      setLowStockCount(tanks.filter((t) => t.low_threshold && (t.current_balance ?? 0) < t.low_threshold).length);
      setTankLevels(tanks);
    } catch (e) { console.error("Dashboard: stock", e); }

    try {
      const { data } = await supabase
        .from("orders")
        .select("order_date, quantity_liters, total_sale")
        .gte("order_date", thirtyDaysAgo)
        .in("status", ["approved", "delivered"])
        .order("order_date");
      const revMap = new Map<string, DailyRevenue>();
      for (const o of data ?? []) {
        const d = o.order_date;
        const existing = revMap.get(d);
        if (existing) {
          existing.revenue += o.total_sale ?? 0;
          existing.liters += o.quantity_liters ?? 0;
          existing.count++;
        } else {
          revMap.set(d, {
            date: d,
            label: new Date(d).toLocaleDateString("en-MY", { month: "short", day: "numeric" }),
            revenue: o.total_sale ?? 0,
            liters: o.quantity_liters ?? 0,
            count: 1,
          });
        }
      }
      setRevenueData(Array.from(revMap.values()));
    } catch (e) { console.error("Dashboard: revenue", e); }

    try {
      const { data } = await supabase
        .from("fleet_documents")
        .select("id, vehicle_id, doc_type, days_remaining, status")
        .or("status.eq.expiring_soon,status.eq.expired")
        .order("days_remaining")
        .limit(10);
      const vehicleIds = [...new Set((data ?? []).map((d: { vehicle_id: string }) => d.vehicle_id))];
      const { data: vehicles } = vehicleIds.length > 0
        ? await supabase.from("vehicles").select("id, plate_number").in("id", vehicleIds)
        : { data: [] };
      const plateMap = new Map<string, string>();
      for (const v of vehicles ?? []) plateMap.set(v.id, v.plate_number);

      const alerts: FleetAlert[] = (data ?? []).map((doc: { id: string; vehicle_id: string; doc_type: string; days_remaining: number | null; status: string | null }) => ({
        id: doc.id,
        vehicle_id: doc.vehicle_id,
        plate_number: plateMap.get(doc.vehicle_id) ?? "Unknown",
        doc_type: doc.doc_type,
        days_remaining: doc.days_remaining,
        status: doc.status,
      }));
      setFleetAlerts(alerts);
    } catch (e) { console.error("Dashboard: fleet", e); }

    try {
      const { data } = await supabase
        .from("orders")
        .select("id, order_date, quantity_liters, status, customer_id")
        .order("created_at", { ascending: false })
        .limit(10);
      const customerIds = [...new Set((data ?? []).map((o: { customer_id: string | null }) => o.customer_id).filter(Boolean))];
      const { data: customers } = customerIds.length > 0
        ? await supabase.from("customers").select("id, name").in("id", customerIds as string[])
        : { data: [] };
      const nameMap = new Map<string, string>();
      for (const c of customers ?? []) nameMap.set(c.id, c.name);

      const recent: RecentOrder[] = (data ?? []).map((o: { id: string; order_date: string; quantity_liters: number | null; status: string; customer_id: string | null }) => ({
        id: o.id,
        order_date: o.order_date,
        customer_name: o.customer_id ? (nameMap.get(o.customer_id) ?? "—") : "—",
        quantity_liters: o.quantity_liters,
        status: o.status,
      }));
      setRecentOrders(recent);
    } catch (e) { console.error("Dashboard: recent orders", e); }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <ClipboardList className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Today&apos;s Orders</p>
            </div>
            <p className="text-2xl font-bold mt-1">{todayCount}</p>
            <p className="text-xs text-muted-foreground">
              {todayLiters.toLocaleString()}L | RM {todayRevenue.toFixed(0)}
            </p>
          </CardContent>
        </Card>

        <Link href="/orders?status=pending">
          <Card className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-status-pending-bg">
                  <Clock className="w-4 h-4 text-status-pending-fg" />
                </div>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <p className="text-2xl font-bold mt-1 text-status-pending-fg">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Click to review</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-accent/15">
                <DollarSign className="w-4 h-4 text-accent-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
            <p className="text-2xl font-bold mt-1">RM {outstanding.toFixed(0)}</p>
            {overdueCount > 0 && (
              <p className="text-xs text-destructive font-medium">{overdueCount} overdue</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-chart-4/15">
                <Droplets className="w-4 h-4 text-chart-4" />
              </div>
              <p className="text-xs text-muted-foreground">Stock Level</p>
            </div>
            <p className="text-2xl font-bold mt-1">{totalStock.toLocaleString()}L</p>
            {lowStockCount > 0 && (
              <p className="text-xs text-destructive font-medium">
                <AlertTriangle className="inline w-3 h-3" /> {lowStockCount} low
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="animate-slide-up" style={{ animationDelay: "100ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === "revenue"
                        ? `RM ${Number(value ?? 0).toFixed(0)}`
                        : `${Number(value ?? 0).toLocaleString()}L`,
                      name === "revenue" ? "Revenue" : "Volume",
                    ]}
                  />
                  <Bar yAxisId="left" dataKey="revenue" fill={chart1} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="liters" stroke={chart2} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up" style={{ animationDelay: "150ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tank Levels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5 max-h-[250px] overflow-y-auto">
              {tankLevels.map((t) => {
                const pct = t.capacity_liters
                  ? ((t.current_balance ?? 0) / t.capacity_liters) * 100
                  : 0;
                const barColor =
                  pct > 50 ? "bg-status-approved-fg" : pct > 20 ? "bg-status-pending-fg" : "bg-destructive";
                return (
                  <div key={t.code} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{t.code}</span>
                      <span className="text-muted-foreground">
                        {(t.current_balance ?? 0).toLocaleString()}L / {(t.capacity_liters ?? 0).toLocaleString()}L
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Action Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="animate-slide-up" style={{ animationDelay: "200ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Fleet Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fleetAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No alerts</p>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {fleetAlerts.map((a) => (
                  <Link
                    key={a.id}
                    href={`/fleet/${a.vehicle_id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors text-sm group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          a.status === "expired" ? "bg-destructive animate-pulse-status" : "bg-status-pending-fg"
                        }`}
                      />
                      <span className="font-medium">{a.plate_number}</span>
                      <span className="text-muted-foreground text-xs">{a.doc_type}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-xs font-medium ${
                          (a.days_remaining ?? 0) < 0 ? "text-destructive" : "text-status-pending-fg"
                        }`}
                      >
                        {(a.days_remaining ?? 0) < 0 ? "EXPIRED" : `${a.days_remaining}d left`}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-slide-up" style={{ animationDelay: "250ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors text-sm group"
                >
                  <div>
                    <span className="text-xs text-muted-foreground mr-2">
                      {new Date(o.order_date).toLocaleDateString("en-MY", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="font-medium">{o.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">
                      {(o.quantity_liters ?? 0).toLocaleString()}L
                    </span>
                    <StatusBadge status={o.status} type="order" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
