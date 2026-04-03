"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StockLocation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, History, List } from "lucide-react";

interface WAC {
  total_qty: number;
  total_value: number;
  avg_cost: number;
}

interface TodaySummary {
  purchases: number;
  sales: number;
}

function FillBar({ location }: { location: StockLocation }) {
  const capacity = location.capacity_liters ?? 0;
  const balance = location.current_balance ?? 0;
  const threshold = location.low_threshold ?? 0;
  const pct = capacity > 0 ? Math.min((balance / capacity) * 100, 100) : 0;
  const isLow = threshold > 0 && balance < threshold;

  let color = "bg-status-approved-fg";
  if (pct < 20) color = "bg-destructive";
  else if (pct < 50) color = "bg-status-pending-fg";

  return (
    <Card className={isLow ? "border-destructive bg-destructive/10" : ""}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-semibold text-sm">{location.name || location.code}</p>
            <p className="text-xs text-muted-foreground">{location.code}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm">
              {balance.toLocaleString()}L
            </p>
            {capacity > 0 && (
              <p className="text-xs text-muted-foreground">
                / {capacity.toLocaleString()}L
              </p>
            )}
          </div>
        </div>
        {capacity > 0 ? (
          <div className="w-full bg-muted rounded-full h-3">
            <div
              className={`${color} h-3 rounded-full transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No capacity set</div>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {capacity > 0 ? `${pct.toFixed(1)}%` : ""}
          </span>
          <div className="flex gap-1">
            {isLow && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                LOW
              </Badge>
            )}
            {location.owner === "Partner" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Partner
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StockDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [companyWac, setCompanyWac] = useState<WAC | null>(null);
  const [partnerWac, setPartnerWac] = useState<WAC | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummary>({
    purchases: 0,
    sales: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];

    const [locRes, companyWacRes, partnerWacRes, purchasesRes, salesRes] =
      await Promise.all([
        supabase.from("stock_locations").select("*").order("code"),
        supabase.rpc("calculate_wac", { p_owner: "Company" }),
        supabase.rpc("calculate_wac", { p_owner: "Partner" }),
        supabase
          .from("stock_transactions")
          .select("quantity_liters")
          .eq("type", "purchase")
          .gte("transaction_date", `${today}T00:00:00`)
          .lte("transaction_date", `${today}T23:59:59`),
        supabase
          .from("stock_transactions")
          .select("quantity_liters")
          .eq("type", "sale")
          .gte("transaction_date", `${today}T00:00:00`)
          .lte("transaction_date", `${today}T23:59:59`),
      ]);

    if (locRes.data) setLocations(locRes.data);
    if (companyWacRes.data?.[0]) setCompanyWac(companyWacRes.data[0]);
    if (partnerWacRes.data?.[0]) setPartnerWac(partnerWacRes.data[0]);

    setTodaySummary({
      purchases: (purchasesRes.data ?? []).reduce(
        (s: number, r: { quantity_liters: number | null }) => s + (r.quantity_liters ?? 0),
        0
      ),
      sales: (salesRes.data ?? []).reduce(
        (s: number, r: { quantity_liters: number | null }) => s + (r.quantity_liters ?? 0),
        0
      ),
    });

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading stock data...</div>;
  }

  const tanks = locations.filter((l) => l.type === "tank" || l.type === "drum");
  const vehicles = locations.filter((l) => l.type === "vehicle");
  const meters = locations.filter((l) => l.type === "meter");

  const totalTank = tanks.reduce((s, l) => s + (l.current_balance ?? 0), 0);
  const totalVehicle = vehicles.reduce(
    (s, l) => s + (l.current_balance ?? 0),
    0
  );
  const lowCount = locations.filter(
    (l) =>
      (l.low_threshold ?? 0) > 0 &&
      (l.current_balance ?? 0) < (l.low_threshold ?? 0)
  ).length;

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-primary">Stock Control</h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/stock/transactions">
            <Button variant="outline" size="sm">
              <List className="w-4 h-4 mr-1" /> Transactions
            </Button>
          </Link>
          <Link href="/stock/stock-take">
            <Button variant="outline" size="sm">
              <ClipboardCheck className="w-4 h-4 mr-1" /> Stock Take
            </Button>
          </Link>
          <Link href="/stock/history">
            <Button variant="outline" size="sm">
              <History className="w-4 h-4 mr-1" /> History
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total in Tanks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalTank.toLocaleString()}L
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total in Trucks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalVehicle.toLocaleString()}L
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Today&apos;s Purchases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-status-approved-fg">
              {todaySummary.purchases.toLocaleString()}L
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Today&apos;s Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {todaySummary.sales.toLocaleString()}L
            </p>
          </CardContent>
        </Card>
      </div>

      {/* WAC Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-1">Company WAC</p>
            <p className="text-xl font-bold">
              RM {(companyWac?.avg_cost ?? 0).toFixed(4)}/L
            </p>
            <p className="text-xs text-muted-foreground">
              Qty: {(companyWac?.total_qty ?? 0).toLocaleString()}L | Value: RM{" "}
              {(companyWac?.total_value ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-1">Partner WAC</p>
            <p className="text-xl font-bold">
              RM {(partnerWac?.avg_cost ?? 0).toFixed(4)}/L
            </p>
            <p className="text-xs text-muted-foreground">
              Qty: {(partnerWac?.total_qty ?? 0).toLocaleString()}L | Value: RM{" "}
              {(partnerWac?.total_value ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowCount > 0 && (
        <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
          <p className="text-destructive font-semibold">
            {lowCount} location{lowCount > 1 ? "s" : ""} below threshold
          </p>
        </div>
      )}

      {/* Tank Gauges */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Tanks</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {tanks.map((loc) => (
            <FillBar key={loc.id} location={loc} />
          ))}
        </div>
      </div>

      {/* Vehicle Locations */}
      {vehicles.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Vehicles</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {vehicles.map((loc) => (
              <FillBar key={loc.id} location={loc} />
            ))}
          </div>
        </div>
      )}

      {/* Meter */}
      {meters.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Meter</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {meters.map((loc) => (
              <Card key={loc.id}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="font-semibold text-sm">{loc.name || loc.code}</p>
                      <p className="text-xs text-muted-foreground">{loc.code}</p>
                    </div>
                    <p className="font-bold text-sm">
                      {(loc.current_balance ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground italic">Reading only</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
