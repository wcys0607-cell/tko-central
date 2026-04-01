"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { exportToExcel } from "@/lib/export-excel";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type GroupBy = "customer" | "product" | "driver" | "month";

interface SalesRow {
  group: string;
  orders: number;
  qty: number;
  revenue: number;
}

export default function SalesReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const now = new Date();
  const [fromDate, setFromDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  );
  const [toDate, setToDate] = useState(now.toISOString().split("T")[0]);
  const [groupBy, setGroupBy] = useState<GroupBy>("customer");
  const [data, setData] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);

    const { data: orders } = await supabase
      .from("orders")
      .select(
        "order_date, quantity_liters, total_sale, customer:customers!orders_customer_id_fkey(name), product:products!orders_product_id_fkey(name), driver:drivers!orders_driver_id_fkey(name)"
      )
      .gte("order_date", fromDate)
      .lte("order_date", toDate)
      .in("status", ["approved", "delivered"])
      .order("order_date");

    const map = new Map<string, SalesRow>();

    for (const o of orders ?? []) {
      let key = "";
      if (groupBy === "customer") {
        const name = Array.isArray(o.customer) ? o.customer[0]?.name : o.customer?.name;
        key = name ?? "Unknown";
      } else if (groupBy === "product") {
        const name = Array.isArray(o.product) ? o.product[0]?.name : o.product?.name;
        key = name ?? "Unknown";
      } else if (groupBy === "driver") {
        const name = Array.isArray(o.driver) ? o.driver[0]?.name : o.driver?.name;
        key = name ?? "Unassigned";
      } else {
        key = o.order_date.slice(0, 7); // YYYY-MM
      }

      const existing = map.get(key);
      if (existing) {
        existing.orders++;
        existing.qty += o.quantity_liters ?? 0;
        existing.revenue += o.total_sale ?? 0;
      } else {
        map.set(key, {
          group: key,
          orders: 1,
          qty: o.quantity_liters ?? 0,
          revenue: o.total_sale ?? 0,
        });
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) =>
      groupBy === "month" ? a.group.localeCompare(b.group) : b.revenue - a.revenue
    );
    setData(sorted);
    setLoading(false);
  }, [supabase, fromDate, toDate, groupBy]);

  useEffect(() => {
    generate();
  }, [generate]);

  function handleDownload() {
    exportToExcel({
      data: data as unknown as Record<string, unknown>[],
      headers: [
        { key: "group", label: groupBy.charAt(0).toUpperCase() + groupBy.slice(1) },
        { key: "orders", label: "Orders", format: "number" },
        { key: "qty", label: "Qty (L)", format: "number" },
        { key: "revenue", label: "Revenue (RM)", format: "currency" },
      ],
      sheetName: "Sales Summary",
      fileName: `TKO_Sales_${fromDate}_${toDate}`,
      title: `Sales Summary by ${groupBy} (${fromDate} to ${toDate})`,
      totalRow: true,
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-primary">Sales Summary</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-[160px]"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="w-[160px]"
        />
        <div className="flex gap-1">
          {(["customer", "product", "driver", "month"] as GroupBy[]).map((g) => (
            <Button
              key={g}
              variant={groupBy === g ? "default" : "outline"}
              size="sm"
              className={groupBy === g ? "bg-primary" : ""}
              onClick={() => setGroupBy(g)}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={data.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Excel
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Generating...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground">No sales data for this period</p>
      ) : (
        <>
          {/* Chart */}
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="group" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`RM ${Number(value ?? 0).toFixed(0)}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left p-3">{groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</th>
                  <th className="text-right p-3">Orders</th>
                  <th className="text-right p-3">Qty (L)</th>
                  <th className="text-right p-3">Revenue (RM)</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.group} className="border-b hover:bg-muted">
                    <td className="p-3 font-medium">{r.group}</td>
                    <td className="p-3 text-right">{r.orders}</td>
                    <td className="p-3 text-right font-mono">{r.qty.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{r.revenue.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-muted font-bold">
                  <td className="p-3">TOTAL</td>
                  <td className="p-3 text-right">{data.reduce((s, r) => s + r.orders, 0)}</td>
                  <td className="p-3 text-right font-mono">{data.reduce((s, r) => s + r.qty, 0).toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">{data.reduce((s, r) => s + r.revenue, 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
