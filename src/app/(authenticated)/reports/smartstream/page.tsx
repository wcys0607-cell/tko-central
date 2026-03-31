"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { exportMultiSheet } from "@/lib/export-excel";

interface SmartStreamOrder {
  order_date: string;
  dn_number: string;
  smart_do_number: string;
  references_number: string;
  document_number: string;
  destination: string;
  r95_liters: number;
  ado_liters: number;
  quantity_liters: number;
  unit_price: number;
  total_sale: number;
  sst_amount: number;
  plate_number: string;
}

interface TruckGroup {
  plate_number: string;
  orders: SmartStreamOrder[];
  total_qty: number;
  total_sale: number;
  total_sst: number;
}

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-MY", { year: "numeric", month: "long" }),
    });
  }
  return options;
}

export default function SmartStreamReportPage() {
  const supabase = createClient();
  const monthOptions = getMonthOptions();
  const [month, setMonth] = useState(monthOptions[0].value);
  const [data, setData] = useState<TruckGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    const [year, m] = month.split("-").map(Number);
    const firstDay = `${year}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(year, m, 0);
    const lastDayStr = `${year}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    const { data: orders } = await supabase
      .from("orders")
      .select(
        "order_date, dn_number, smart_do_number, references_number, document_number, destination, r95_liters, ado_liters, quantity_liters, unit_price, total_sale, sst_amount, vehicle:vehicles!orders_vehicle_id_fkey(plate_number), customer:customers!orders_customer_id_fkey(name)"
      )
      .gte("order_date", firstDay)
      .lte("order_date", lastDayStr)
      .in("status", ["approved", "delivered"])
      .ilike("customer.name", "%SMART STREAM%")
      .order("order_date");

    // Group by truck
    const truckMap = new Map<string, TruckGroup>();

    for (const o of orders ?? []) {
      const plate = Array.isArray(o.vehicle) ? o.vehicle[0]?.plate_number : o.vehicle?.plate_number;
      const plateStr = plate ?? "Unknown";

      if (!truckMap.has(plateStr)) {
        truckMap.set(plateStr, { plate_number: plateStr, orders: [], total_qty: 0, total_sale: 0, total_sst: 0 });
      }

      const group = truckMap.get(plateStr)!;
      const qty = o.quantity_liters ?? 0;
      const sale = o.total_sale ?? 0;
      const sst = o.sst_amount ?? 0;

      group.orders.push({
        order_date: o.order_date,
        dn_number: o.dn_number ?? "",
        smart_do_number: o.smart_do_number ?? "",
        references_number: o.references_number ?? "",
        document_number: o.document_number ?? "",
        destination: o.destination ?? "",
        r95_liters: o.r95_liters ?? 0,
        ado_liters: o.ado_liters ?? 0,
        quantity_liters: qty,
        unit_price: o.unit_price ?? 0,
        total_sale: sale,
        sst_amount: sst,
        plate_number: plateStr,
      });

      group.total_qty += qty;
      group.total_sale += sale;
      group.total_sst += sst;
    }

    setData(Array.from(truckMap.values()).sort((a, b) => a.plate_number.localeCompare(b.plate_number)));
    setLoading(false);
  }, [supabase, month]);

  useEffect(() => {
    generate();
  }, [generate]);

  function handleDownload() {
    const sheets = data.map((g) => ({
      name: g.plate_number,
      title: `SmartStream Statement — ${g.plate_number} — ${month}`,
      totalRow: true,
      headers: [
        { key: "order_date", label: "Date" },
        { key: "dn_number", label: "DN No" },
        { key: "smart_do_number", label: "Smart DO No" },
        { key: "references_number", label: "References No" },
        { key: "document_number", label: "Document No" },
        { key: "destination", label: "Destination" },
        { key: "r95_liters", label: "R95", format: "number" as const },
        { key: "ado_liters", label: "ADO", format: "number" as const },
        { key: "quantity_liters", label: "Qty (L)", format: "number" as const },
        { key: "unit_price", label: "Unit Price", format: "currency" as const },
        { key: "total_sale", label: "Total Sale", format: "currency" as const },
        { key: "sst_amount", label: "SST 6%", format: "currency" as const },
      ],
      data: g.orders as unknown as Record<string, unknown>[],
    }));

    exportMultiSheet(sheets, `TKO_SmartStream_${month}`);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#1A3A5C]">SmartStream Statement</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={month} onValueChange={(v) => v && setMonth(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={data.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Download Excel
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Generating...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground">No SmartStream orders for this month</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Truck</th>
                <th className="text-right p-3">Orders</th>
                <th className="text-right p-3">Total Qty</th>
                <th className="text-right p-3">Total Sale</th>
                <th className="text-right p-3">SST</th>
                <th className="text-right p-3 font-bold">Total w/ SST</th>
              </tr>
            </thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.plate_number} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{g.plate_number}</td>
                  <td className="p-3 text-right">{g.orders.length}</td>
                  <td className="p-3 text-right font-mono">{g.total_qty.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">{g.total_sale.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">{g.total_sst.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono font-bold">
                    {(g.total_sale + g.total_sst).toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="p-3">TOTAL</td>
                <td className="p-3 text-right">{data.reduce((s, g) => s + g.orders.length, 0)}</td>
                <td className="p-3 text-right font-mono">{data.reduce((s, g) => s + g.total_qty, 0).toLocaleString()}</td>
                <td className="p-3 text-right font-mono">{data.reduce((s, g) => s + g.total_sale, 0).toFixed(2)}</td>
                <td className="p-3 text-right font-mono">{data.reduce((s, g) => s + g.total_sst, 0).toFixed(2)}</td>
                <td className="p-3 text-right font-mono">
                  {data.reduce((s, g) => s + g.total_sale + g.total_sst, 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
