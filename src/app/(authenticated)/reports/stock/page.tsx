"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { exportToExcel } from "@/lib/export-excel";

interface StockMovement {
  id: string;
  transaction_date: string;
  type: string;
  source_code: string;
  dest_code: string;
  quantity_liters: number;
  price_per_liter: number | null;
  reference: string;
}

interface LocationVariance {
  code: string;
  current_balance: number;
  last_stock_take: number | null;
  variance: number | null;
}

export default function StockReportPage() {
  const supabase = createClient();
  const now = new Date();
  const [fromDate, setFromDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  );
  const [toDate, setToDate] = useState(now.toISOString().split("T")[0]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [variances, setVariances] = useState<LocationVariance[]>([]);
  const [purchases, setPurchases] = useState(0);
  const [sales, setSales] = useState(0);
  const [adjustments, setAdjustments] = useState(0);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);

    const [txRes, locRes, stRes] = await Promise.all([
      supabase
        .from("stock_transactions")
        .select(
          "id, transaction_date, type, quantity_liters, price_per_liter, reference, source_location:stock_locations!stock_transactions_source_location_id_fkey(code), dest_location:stock_locations!stock_transactions_dest_location_id_fkey(code)"
        )
        .gte("transaction_date", fromDate)
        .lte("transaction_date", toDate)
        .order("transaction_date", { ascending: false }),
      supabase.from("stock_locations").select("code, current_balance").eq("type", "tank"),
      supabase
        .from("stock_takes")
        .select("location_id, measured_liters, date, location:stock_locations!stock_takes_location_id_fkey(code)")
        .order("date", { ascending: false }),
    ]);

    const txns = txRes.data ?? [];
    let purch = 0, sal = 0, adj = 0;
    const mvts: StockMovement[] = [];

    for (const t of txns) {
      const srcCode = Array.isArray(t.source_location) ? t.source_location[0]?.code : t.source_location?.code;
      const destCode = Array.isArray(t.dest_location) ? t.dest_location[0]?.code : t.dest_location?.code;
      const qty = t.quantity_liters ?? 0;

      if (t.type === "purchase") purch += qty;
      else if (t.type === "sale") sal += qty;
      else if (t.type === "adjustment") adj += qty;

      mvts.push({
        id: t.id,
        transaction_date: t.transaction_date,
        type: t.type,
        source_code: srcCode ?? "—",
        dest_code: destCode ?? "—",
        quantity_liters: qty,
        price_per_liter: t.price_per_liter,
        reference: t.reference ?? "",
      });
    }

    setPurchases(purch);
    setSales(sal);
    setAdjustments(adj);
    setMovements(mvts);

    // Variance: latest stock take per location vs system
    const locs = locRes.data ?? [];
    const stData = stRes.data ?? [];
    const latestST = new Map<string, number>();
    for (const st of stData) {
      const code = Array.isArray(st.location) ? st.location[0]?.code : st.location?.code;
      if (code && !latestST.has(code)) {
        latestST.set(code, st.measured_liters ?? 0);
      }
    }

    const vars: LocationVariance[] = locs.map((l: { code: string; current_balance: number | null }) => {
      const measured = latestST.get(l.code) ?? null;
      return {
        code: l.code,
        current_balance: l.current_balance ?? 0,
        last_stock_take: measured,
        variance: measured !== null ? (l.current_balance ?? 0) - measured : null,
      };
    });
    setVariances(vars);
    setLoading(false);
  }, [supabase, fromDate, toDate]);

  useEffect(() => {
    generate();
  }, [generate]);

  function handleDownload() {
    exportToExcel({
      data: movements as unknown as Record<string, unknown>[],
      headers: [
        { key: "transaction_date", label: "Date" },
        { key: "type", label: "Type" },
        { key: "source_code", label: "From" },
        { key: "dest_code", label: "To" },
        { key: "quantity_liters", label: "Qty (L)", format: "number" },
        { key: "price_per_liter", label: "Price/L", format: "currency" },
        { key: "reference", label: "Reference" },
      ],
      sheetName: "Stock Movements",
      fileName: `TKO_Stock_${fromDate}_${toDate}`,
      title: `Stock Report (${fromDate} to ${toDate})`,
      totalRow: false,
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#1A3A5C]">Stock Report</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px]" />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[160px]" />
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={movements.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Excel
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Generating...</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Purchases</p>
                <p className="text-lg font-bold text-green-600">+{purchases.toLocaleString()}L</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Sales</p>
                <p className="text-lg font-bold text-red-600">-{sales.toLocaleString()}L</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Adjustments</p>
                <p className="text-lg font-bold">{adjustments > 0 ? "+" : ""}{adjustments.toLocaleString()}L</p>
              </CardContent>
            </Card>
          </div>

          {/* Variance Table */}
          <h2 className="text-sm font-semibold text-[#1A3A5C]">Variance (System vs Last Stock Take)</h2>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Location</th>
                  <th className="text-right p-3">System Balance</th>
                  <th className="text-right p-3">Last Stock Take</th>
                  <th className="text-right p-3">Variance</th>
                </tr>
              </thead>
              <tbody>
                {variances.map((v) => (
                  <tr key={v.code} className="border-b">
                    <td className="p-3 font-medium">{v.code}</td>
                    <td className="p-3 text-right font-mono">{v.current_balance.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{v.last_stock_take !== null ? v.last_stock_take.toLocaleString() : "—"}</td>
                    <td className={`p-3 text-right font-mono ${v.variance && Math.abs(v.variance) > v.current_balance * 0.05 ? "text-red-600 font-bold" : ""}`}>
                      {v.variance !== null ? v.variance.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Movement Table */}
          <h2 className="text-sm font-semibold text-[#1A3A5C]">Movements ({movements.length})</h2>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">From</th>
                  <th className="text-left p-3">To</th>
                  <th className="text-right p-3">Qty (L)</th>
                  <th className="text-right p-3">Price/L</th>
                  <th className="text-left p-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 100).map((m) => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 whitespace-nowrap text-xs">{m.transaction_date}</td>
                    <td className="p-3 text-xs capitalize">{m.type}</td>
                    <td className="p-3 text-xs">{m.source_code}</td>
                    <td className="p-3 text-xs">{m.dest_code}</td>
                    <td className="p-3 text-right font-mono">{m.quantity_liters.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{m.price_per_liter?.toFixed(4) ?? "—"}</td>
                    <td className="p-3 text-xs">{m.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
