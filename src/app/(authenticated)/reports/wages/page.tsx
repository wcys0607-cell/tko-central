"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft, Download, Send, Loader2 } from "lucide-react";
import { exportMultiSheet } from "@/lib/export-excel";

interface DriverWage {
  driver_id: string;
  driver_name: string;
  deliveries: number;
  total_qty: number;
  total_wages: number;
  total_allowance: number;
  total_transport: number;
  orders: {
    order_date: string;
    plate_number: string;
    customer_name: string;
    load_from: string;
    destination: string;
    quantity_liters: number;
    transport: number;
    wages: number;
    allowance: number;
  }[];
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

export default function WagesReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const monthOptions = getMonthOptions();
  const [month, setMonth] = useState(monthOptions[0].value);
  const [data, setData] = useState<DriverWage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    const [year, m] = month.split("-").map(Number);
    const firstDay = `${year}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(year, m, 0);
    const lastDayStr = `${year}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    const { data: orders } = await supabase
      .from("orders")
      .select(
        "order_date, quantity_liters, wages, allowance, transport, destination, load_from, driver_id, driver:drivers!orders_driver_id_fkey(id, name), vehicle:vehicles!orders_vehicle_id_fkey(plate_number), customer:customers!orders_customer_id_fkey(name)"
      )
      .gte("order_date", firstDay)
      .lte("order_date", lastDayStr)
      .in("status", ["approved", "delivered"])
      .not("driver_id", "is", null)
      .order("order_date");

    // Group by driver
    const driverMap = new Map<string, DriverWage>();

    for (const o of orders ?? []) {
      const driverId = o.driver_id as string;
      const driverName = Array.isArray(o.driver) ? o.driver[0]?.name : o.driver?.name;
      const platNumber = Array.isArray(o.vehicle) ? o.vehicle[0]?.plate_number : o.vehicle?.plate_number;
      const custName = Array.isArray(o.customer) ? o.customer[0]?.name : o.customer?.name;

      if (!driverMap.has(driverId)) {
        driverMap.set(driverId, {
          driver_id: driverId,
          driver_name: driverName ?? "Unknown",
          deliveries: 0,
          total_qty: 0,
          total_wages: 0,
          total_allowance: 0,
          total_transport: 0,
          orders: [],
        });
      }

      const dw = driverMap.get(driverId)!;
      dw.deliveries++;
      dw.total_qty += o.quantity_liters ?? 0;
      dw.total_wages += o.wages ?? 0;
      dw.total_allowance += o.allowance ?? 0;
      dw.total_transport += o.transport ?? 0;
      dw.orders.push({
        order_date: o.order_date,
        plate_number: platNumber ?? "",
        customer_name: custName ?? "",
        load_from: o.load_from ?? "",
        destination: o.destination ?? "",
        quantity_liters: o.quantity_liters ?? 0,
        transport: o.transport ?? 0,
        wages: o.wages ?? 0,
        allowance: o.allowance ?? 0,
      });
    }

    setData(Array.from(driverMap.values()).sort((a, b) => a.driver_name.localeCompare(b.driver_name)));
    setLoading(false);
  }, [supabase, month]);

  useEffect(() => {
    generate();
  }, [generate]);

  function handleDownload() {
    const sheets = data.map((dw) => ({
      name: dw.driver_name,
      title: `Wages Statement — ${dw.driver_name} — ${month}`,
      totalRow: true,
      headers: [
        { key: "order_date", label: "Date" },
        { key: "plate_number", label: "Truck" },
        { key: "customer_name", label: "Customer" },
        { key: "load_from", label: "Load From" },
        { key: "destination", label: "Destination" },
        { key: "quantity_liters", label: "Qty (L)", format: "number" as const },
        { key: "transport", label: "Transport", format: "currency" as const },
        { key: "wages", label: "Wages", format: "currency" as const },
        { key: "allowance", label: "Allowance", format: "currency" as const },
      ],
      data: dw.orders as unknown as Record<string, unknown>[],
    }));

    exportMultiSheet(sheets, `TKO_Wages_${month}`);
  }

  async function handleSendWhatsApp() {
    setSending(true);
    try {
      await fetch("/api/reports/send-wages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      alert("WhatsApp messages sent to drivers!");
    } catch {
      alert("Failed to send messages");
    }
    setSending(false);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#1A3A5C]">Wages Report</h1>
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={data.length === 0}
        >
          <Download className="w-4 h-4 mr-1" /> Download Excel
        </Button>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700"
          onClick={handleSendWhatsApp}
          disabled={data.length === 0 || sending}
        >
          {sending ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-1" />
          )}
          Send to Drivers
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Generating...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground">No wage data for this month</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Driver</th>
                <th className="text-right p-3">Deliveries</th>
                <th className="text-right p-3">Total Qty</th>
                <th className="text-right p-3">Wages</th>
                <th className="text-right p-3">Allowance</th>
                <th className="text-right p-3">Transport</th>
                <th className="text-right p-3 font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((dw) => (
                <tr key={dw.driver_id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{dw.driver_name}</td>
                  <td className="p-3 text-right">{dw.deliveries}</td>
                  <td className="p-3 text-right font-mono">{dw.total_qty.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">{dw.total_wages.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">{dw.total_allowance.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">{dw.total_transport.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono font-bold">
                    {(dw.total_wages + dw.total_allowance + dw.total_transport).toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="p-3">TOTAL</td>
                <td className="p-3 text-right">{data.reduce((s, d) => s + d.deliveries, 0)}</td>
                <td className="p-3 text-right font-mono">{data.reduce((s, d) => s + d.total_qty, 0).toLocaleString()}</td>
                <td className="p-3 text-right font-mono">{data.reduce((s, d) => s + d.total_wages, 0).toFixed(2)}</td>
                <td className="p-3 text-right font-mono">{data.reduce((s, d) => s + d.total_allowance, 0).toFixed(2)}</td>
                <td className="p-3 text-right font-mono">{data.reduce((s, d) => s + d.total_transport, 0).toFixed(2)}</td>
                <td className="p-3 text-right font-mono">
                  {data.reduce((s, d) => s + d.total_wages + d.total_allowance + d.total_transport, 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
