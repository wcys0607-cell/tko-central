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
        "order_date, quantity_liters, wages, allowance_liters, allowance_unit_price, special_allowance, transport, destination, load_from, driver_id, driver:drivers!orders_driver_id_fkey(id, name), vehicle:vehicles!orders_vehicle_id_fkey(plate_number, capacity_liters), customer:customers!orders_customer_id_fkey(name)"
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
      const veh = Array.isArray(o.vehicle) ? o.vehicle[0] : o.vehicle;
      const platNumber = veh?.plate_number ?? "";
      const capacity = veh?.capacity_liters;
      const truckLabel = platNumber;
      const custName = Array.isArray(o.customer) ? o.customer[0]?.name : o.customer?.name;
      const allowance = (o.allowance_liters ?? 0) * (o.allowance_unit_price ?? 0) + (o.special_allowance ?? 0);

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
      dw.total_allowance += allowance;
      dw.total_transport += o.transport ?? 0;
      dw.orders.push({
        order_date: o.order_date,
        plate_number: truckLabel,
        customer_name: custName ?? "",
        load_from: o.load_from ?? "",
        destination: o.destination ?? "",
        quantity_liters: o.quantity_liters ?? 0,
        transport: o.transport ?? 0,
        wages: o.wages ?? 0,
        allowance,
      });
    }

    setData(Array.from(driverMap.values()).sort((a, b) => a.driver_name.localeCompare(b.driver_name)));
    setLoading(false);
  }, [supabase, month]);

  useEffect(() => {
    generate();
  }, [generate]);

  async function handleDownload() {
    const XLSX = await import("xlsx-js-style");
    const wb = XLSX.utils.book_new();
    const monthLabel = monthOptions.find((o) => o.value === month)?.label ?? month;

    // Style definitions
    const fontDefault = { name: "Arial", sz: 10 };
    const fontSmall = { name: "Arial", sz: 9 };
    const companyFont = { name: "Arial", sz: 14, bold: true, color: { rgb: "1a1a2e" } };
    const payslipFont = { name: "Arial", sz: 12, bold: true, color: { rgb: "1a1a2e" } };
    const addressFont = { name: "Arial", sz: 8, color: { rgb: "666666" } };
    const infoFont = { name: "Arial", sz: 10, bold: true };
    const headerFont = { name: "Arial", sz: 9, bold: true, color: { rgb: "FFFFFF" } };
    const headerFill = { fgColor: { rgb: "2d3748" } };
    const totalFont = { name: "Arial", sz: 10, bold: true };
    const totalFill = { fgColor: { rgb: "e2e8f0" } };
    const borderThin = { style: "thin", color: { rgb: "cccccc" } };
    const borderAll = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
    const borderHeader = {
      top: { style: "thin", color: { rgb: "2d3748" } },
      bottom: { style: "thin", color: { rgb: "2d3748" } },
      left: { style: "thin", color: { rgb: "2d3748" } },
      right: { style: "thin", color: { rgb: "2d3748" } },
    };
    const borderTotal = {
      top: { style: "medium", color: { rgb: "2d3748" } },
      bottom: { style: "double", color: { rgb: "2d3748" } },
      left: borderThin,
      right: borderThin,
    };

    const numFmt2dp = "#,##0.00";
    const numFmtQty = "#,##0";

    for (const dw of data) {
      // Build raw data first
      const rows: unknown[][] = [];
      // Row 1: Company name
      rows.push(["TOP KIM OIL SDN. BHD.", "", "", "", "", "", "", "", "DRIVER PAYSLIP"]);
      // Row 2: Address
      rows.push(["337, PTD 41613 (LOT 39305), JALAN IDAMAN 1/17, TAMAN DESA IDAMAN, 81400 SENAI, JOHOR."]);
      // Row 3: empty separator
      rows.push([]);
      // Row 4: Driver + Month info
      rows.push([`Driver: ${dw.driver_name}`, "", "", "", "", "", "", "", `Month: ${monthLabel}`]);
      // Row 5: empty
      rows.push([]);
      // Row 6: headers
      rows.push(["Date", "Truck No.", "Customer Name", "Load From", "Destination", "Quantity (L)", "Transport (RM)", "Wages (RM)", "Allowance (RM)"]);

      // Data rows (row 7+)
      for (const o of dw.orders) {
        rows.push([
          o.order_date,
          o.plate_number,
          o.customer_name,
          o.load_from,
          o.destination,
          o.quantity_liters || null,
          o.transport || null,
          o.wages || null,
          o.allowance || null,
        ]);
      }

      // Total row
      const lastDataRow = 6 + dw.orders.length;
      rows.push([
        "", "", "", "", "TOTAL", "",
        { f: `SUM(G7:G${lastDataRow})` },
        { f: `SUM(H7:H${lastDataRow})` },
        { f: `SUM(I7:I${lastDataRow})` },
      ]);

      // Grand total row
      rows.push([
        "", "", "", "", "", "", "", "GRAND TOTAL",
        { f: `G${lastDataRow + 1}+H${lastDataRow + 1}+I${lastDataRow + 1}` },
      ]);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Column widths (A4 portrait optimised)
      ws["!cols"] = [
        { wch: 11 },  // A: Date
        { wch: 11 },  // B: Truck No.
        { wch: 28 },  // C: Customer Name
        { wch: 18 },  // D: Load From
        { wch: 20 },  // E: Destination
        { wch: 11 },  // F: Quantity
        { wch: 11 },  // G: Transport
        { wch: 11 },  // H: Wages
        { wch: 11 },  // I: Allowance
      ];

      // Row heights
      ws["!rows"] = [
        { hpt: 22 },  // Row 1: Company name
        { hpt: 14 },  // Row 2: Address
        { hpt: 10 },  // Row 3: separator
        { hpt: 18 },  // Row 4: Driver/Month
        { hpt: 8 },   // Row 5: separator
        { hpt: 20 },  // Row 6: headers
      ];

      // Merge cells
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },  // A1:E1 company name
        { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } },  // F1:I1 payslip title (right side)
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },  // A2:I2 address
        { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },  // A4:E4 driver name
        { s: { r: 3, c: 5 }, e: { r: 3, c: 8 } },  // F4:I4 month
      ];

      // Apply styles
      // Row 1: Company name
      const cellA1 = ws["A1"];
      if (cellA1) cellA1.s = { font: companyFont, alignment: { vertical: "center" } };
      // Payslip title - it's in column F after merge but we set on I1 originally
      // Actually with merge F1:I1, the content should be on F1
      ws["F1"] = { v: "DRIVER PAYSLIP", t: "s", s: { font: payslipFont, alignment: { horizontal: "right", vertical: "center" } } };
      // Remove I1 since we moved content to F1 for the merge
      delete ws["I1"];

      // Row 2: Address
      const cellA2 = ws["A2"];
      if (cellA2) cellA2.s = { font: addressFont, alignment: { vertical: "center" } };

      // Row 4: Driver + Month
      const cellA4 = ws["A4"];
      if (cellA4) cellA4.s = { font: infoFont, alignment: { vertical: "center" } };
      ws["F4"] = { v: `Month: ${monthLabel}`, t: "s", s: { font: infoFont, alignment: { horizontal: "right", vertical: "center" } } };
      delete ws["I4"];

      // Row 6: Headers (row index 5)
      const headerCols = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
      for (const col of headerCols) {
        const ref = `${col}6`;
        if (ws[ref]) {
          ws[ref].s = {
            font: headerFont,
            fill: headerFill,
            border: borderHeader,
            alignment: { horizontal: col >= "F" ? "right" : "left", vertical: "center", wrapText: true },
          };
        }
      }

      // Data rows styling
      for (let r = 0; r < dw.orders.length; r++) {
        const rowNum = 7 + r;
        const isEven = r % 2 === 0;
        const rowFill = isEven ? { fgColor: { rgb: "f7fafc" } } : undefined;

        for (let c = 0; c < 9; c++) {
          const col = headerCols[c];
          const ref = `${col}${rowNum}`;
          if (!ws[ref]) ws[ref] = { v: "", t: "s" };
          const cell = ws[ref];

          const baseStyle: Record<string, unknown> = {
            font: c <= 4 ? fontSmall : fontDefault,
            border: borderAll,
            alignment: { vertical: "center", horizontal: c >= 5 ? "right" : "left" },
          };
          if (rowFill) baseStyle.fill = rowFill;

          // Number formatting
          if (c === 5 && cell.v) { cell.t = "n"; baseStyle.numFmt = numFmtQty; }
          if ((c === 6 || c === 7 || c === 8) && cell.v) { cell.t = "n"; baseStyle.numFmt = numFmt2dp; }

          cell.s = baseStyle;
        }
      }

      // Total row styling
      const totalRowNum = lastDataRow + 1;
      for (let c = 0; c < 9; c++) {
        const col = headerCols[c];
        const ref = `${col}${totalRowNum}`;
        if (!ws[ref]) ws[ref] = { v: "", t: "s" };
        ws[ref].s = {
          font: totalFont,
          fill: totalFill,
          border: borderTotal,
          alignment: { horizontal: c >= 5 ? "right" : "left", vertical: "center" },
          ...(c >= 6 ? { numFmt: numFmt2dp } : {}),
        };
      }

      // Grand total row styling
      const grandRowNum = totalRowNum + 1;
      for (let c = 0; c < 9; c++) {
        const col = headerCols[c];
        const ref = `${col}${grandRowNum}`;
        if (!ws[ref]) ws[ref] = { v: "", t: "s" };
        ws[ref].s = {
          font: { name: "Arial", sz: 11, bold: true, color: { rgb: "1a1a2e" } },
          border: { top: { style: "medium", color: { rgb: "2d3748" } }, bottom: { style: "double", color: { rgb: "2d3748" } } },
          alignment: { horizontal: c >= 5 ? "right" : "left", vertical: "center" },
          ...(c === 8 ? { numFmt: numFmt2dp } : {}),
        };
      }

      // Print setup: A4 portrait
      ws["!print"] = { orientation: "portrait", paperSize: 9 }; // 9 = A4
      ws["!margins"] = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

      const safeName = dw.driver_name.replace(/[\\/*?[\]:]/g, "").slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    }

    XLSX.writeFile(wb, `Wages-${month}.xlsx`);
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
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-primary">Wages Report</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={month} onValueChange={(v) => v && setMonth(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>{monthOptions.find((o) => o.value === month)?.label ?? month}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.value} value={o.value} label={o.label}>{o.label}</SelectItem>
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
          className="bg-status-approved-fg hover:bg-status-approved-fg/90"
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
            <thead className="bg-muted border-b">
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
                <tr key={dw.driver_id} className="border-b hover:bg-muted">
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
              <tr className="bg-muted font-bold">
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
