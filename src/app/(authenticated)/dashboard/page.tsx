"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ClipboardList,
  Clock,
  DollarSign,
  Droplets,
  AlertTriangle,
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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  delivered: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function DashboardPage() {
  const supabase = createClient();
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
    try {
    const today = new Date().toISOString().split("T")[0];
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    const thirtyDaysAgo = d30.toISOString().split("T")[0];

    const [todayRes, pendingRes, outstandingRes, stockRes, revenueRes, fleetRes, recentRes] =
      await Promise.all([
        supabase
          .from("orders")
          .select("quantity_liters, total_sale")
          .eq("order_date", today)
          .not("status", "eq", "cancelled"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("orders")
          .select("total_sale, bukku_payment_status")
          .not("bukku_invoice_id", "is", null),
        supabase
          .from("stock_locations")
          .select("code, name, current_balance, capacity_liters, low_threshold, type")
          .eq("type", "tank"),
        supabase
          .from("orders")
          .select("order_date, quantity_liters, total_sale")
          .gte("order_date", thirtyDaysAgo)
          .in("status", ["approved", "delivered"])
          .order("order_date"),
        supabase
          .from("fleet_documents")
          .select("id, vehicle_id, doc_type, days_remaining, status, vehicle:vehicles!fleet_documents_vehicle_id_fkey(plate_number)")
          .or("status.eq.expiring_soon,status.eq.expired")
          .order("days_remaining"),
        supabase
          .from("orders")
          .select("id, order_date, quantity_liters, status, customer:customers!orders_customer_id_fkey(name)")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    // KPI: Today
    const todayOrders = todayRes.data ?? [];
    setTodayCount(todayOrders.length);
    setTodayLiters(
      todayOrders.reduce((s: number, o: { quantity_liters: number | null }) => s + (o.quantity_liters ?? 0), 0)
    );
    setTodayRevenue(
      todayOrders.reduce((s: number, o: { total_sale: number | null }) => s + (o.total_sale ?? 0), 0)
    );

    setPendingCount(pendingRes.count ?? 0);

    const outOrders = (outstandingRes.data ?? []).filter(
      (o: { bukku_payment_status: string | null }) => o.bukku_payment_status !== "paid"
    );
    setOutstanding(
      outOrders.reduce((s: number, o: { total_sale: number | null }) => s + (o.total_sale ?? 0), 0)
    );
    setOverdueCount(
      outOrders.filter((o: { bukku_payment_status: string | null }) => o.bukku_payment_status === "overdue").length
    );

    const tanks = (stockRes.data ?? []) as (TankLevel & { low_threshold?: number | null })[];
    setTotalStock(tanks.reduce((s, t) => s + (t.current_balance ?? 0), 0));
    setLowStockCount(tanks.filter((t) => t.low_threshold && (t.current_balance ?? 0) < t.low_threshold).length);
    setTankLevels(tanks);

    // Revenue chart
    const revMap = new Map<string, DailyRevenue>();
    for (const o of revenueRes.data ?? []) {
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

    // Fleet alerts
    const alerts: FleetAlert[] = [];
    for (const doc of fleetRes.data ?? []) {
      const plate = Array.isArray(doc.vehicle) ? doc.vehicle[0]?.plate_number : doc.vehicle?.plate_number;
      alerts.push({
        id: doc.id,
        vehicle_id: doc.vehicle_id,
        plate_number: plate ?? "Unknown",
        doc_type: doc.doc_type,
        days_remaining: doc.days_remaining,
        status: doc.status,
      });
    }
    setFleetAlerts(alerts.slice(0, 10));

    // Recent orders
    const recent: RecentOrder[] = [];
    for (const o of recentRes.data ?? []) {
      const custName = Array.isArray(o.customer) ? o.customer[0]?.name : o.customer?.name;
      recent.push({
        id: o.id,
        order_date: o.order_date,
        customer_name: custName ?? "—",
        quantity_liters: o.quantity_liters,
        status: o.status,
      });
    }
    setRecentOrders(recent);
    } catch (err) {
      console.error("Dashboard load error:", err);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-bold text-[#1A3A5C]">Dashboard</h1>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#1A3A5C]" />
              <p className="text-xs text-muted-foreground">Today&apos;s Orders</p>
            </div>
            <p className="text-2xl font-bold mt-1">{todayCount}</p>
            <p className="text-xs text-muted-foreground">
              {todayLiters.toLocaleString()}L | RM {todayRevenue.toFixed(0)}
            </p>
          </CardContent>
        </Card>

        <Link href="/orders?status=pending">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-600" />
                <p className="text-xs text-muted-foreground">Pending Approval</p>
              </div>
              <p className="text-2xl font-bold mt-1 text-yellow-600">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Click to review</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-orange-600" />
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
            <p className="text-2xl font-bold mt-1">RM {outstanding.toFixed(0)}</p>
            {overdueCount > 0 && (
              <p className="text-xs text-red-600 font-medium">{overdueCount} overdue</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-blue-600" />
              <p className="text-xs text-muted-foreground">Stock Level</p>
            </div>
            <p className="text-2xl font-bold mt-1">{totalStock.toLocaleString()}L</p>
            {lowStockCount > 0 && (
              <p className="text-xs text-red-600 font-medium">
                <AlertTriangle className="inline w-3 h-3" /> {lowStockCount} low
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
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
                  <Bar yAxisId="left" dataKey="revenue" fill="#1A3A5C" radius={[2, 2, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="liters" stroke="#E8A020" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tank Levels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {tankLevels.map((t) => {
                const pct = t.capacity_liters
                  ? ((t.current_balance ?? 0) / t.capacity_liters) * 100
                  : 0;
                const color =
                  pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500";
                return (
                  <div key={t.code} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{t.code}</span>
                      <span className="text-muted-foreground">
                        {(t.current_balance ?? 0).toLocaleString()}L / {(t.capacity_liters ?? 0).toLocaleString()}L
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${color}`}
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Fleet Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fleetAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No alerts</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {fleetAlerts.map((a) => (
                  <Link
                    key={a.id}
                    href={`/fleet/${a.vehicle_id}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          a.status === "expired" ? "bg-red-500" : "bg-yellow-500"
                        }`}
                      />
                      <span className="font-medium">{a.plate_number}</span>
                      <span className="text-muted-foreground text-xs">{a.doc_type}</span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        (a.days_remaining ?? 0) < 0 ? "text-red-600" : "text-yellow-600"
                      }`}
                    >
                      {(a.days_remaining ?? 0) < 0 ? "EXPIRED" : `${a.days_remaining}d left`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 text-sm"
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
                    <Badge variant="secondary" className={STATUS_COLORS[o.status] ?? ""}>
                      {o.status}
                    </Badge>
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
