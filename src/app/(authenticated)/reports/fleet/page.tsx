"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { exportToExcel } from "@/lib/export-excel";

interface Renewal {
  id: string;
  vehicle_id: string;
  plate_number: string;
  doc_type: string;
  expiry_date: string;
  days_remaining: number;
  status: string;
}

interface VehicleCost {
  plate_number: string;
  this_month: number;
  last_3_months: number;
}

export default function FleetReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [costs, setCosts] = useState<VehicleCost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = new Date();
    const sixtyDaysLater = new Date(today);
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);

    const thisMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().split("T")[0];

    const [renewalRes, costRes] = await Promise.all([
      supabase
        .from("fleet_documents")
        .select("id, vehicle_id, doc_type, expiry_date, days_remaining, status, vehicle:vehicles!fleet_documents_vehicle_id_fkey(plate_number)")
        .lte("expiry_date", sixtyDaysLater.toISOString().split("T")[0])
        .not("expiry_date", "is", null)
        .order("days_remaining"),
      supabase
        .from("maintenance_logs")
        .select("service_date, cost, vehicle:vehicles!maintenance_logs_vehicle_id_fkey(plate_number)")
        .gte("service_date", threeMonthsAgoStr)
        .not("cost", "is", null),
    ]);

    // Renewals
    const rens: Renewal[] = [];
    for (const d of renewalRes.data ?? []) {
      const plate = Array.isArray(d.vehicle) ? d.vehicle[0]?.plate_number : d.vehicle?.plate_number;
      rens.push({
        id: d.id,
        vehicle_id: d.vehicle_id,
        plate_number: plate ?? "Unknown",
        doc_type: d.doc_type,
        expiry_date: d.expiry_date!,
        days_remaining: d.days_remaining ?? 0,
        status: d.status ?? "valid",
      });
    }
    setRenewals(rens);

    // Maintenance costs by vehicle
    const costMap = new Map<string, { this_month: number; last_3_months: number }>();
    for (const log of costRes.data ?? []) {
      const plate = Array.isArray(log.vehicle) ? log.vehicle[0]?.plate_number : log.vehicle?.plate_number;
      const plateStr = plate ?? "Unknown";
      if (!costMap.has(plateStr)) {
        costMap.set(plateStr, { this_month: 0, last_3_months: 0 });
      }
      const entry = costMap.get(plateStr)!;
      const cost = log.cost ?? 0;
      entry.last_3_months += cost;
      if (log.service_date >= thisMonthStart) {
        entry.this_month += cost;
      }
    }

    setCosts(
      Array.from(costMap.entries())
        .map(([plate_number, c]) => ({ plate_number, ...c }))
        .sort((a, b) => b.last_3_months - a.last_3_months)
    );

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDownloadRenewals() {
    exportToExcel({
      data: renewals as unknown as Record<string, unknown>[],
      headers: [
        { key: "plate_number", label: "Vehicle" },
        { key: "doc_type", label: "Document" },
        { key: "expiry_date", label: "Expiry Date" },
        { key: "days_remaining", label: "Days Remaining", format: "number" },
        { key: "status", label: "Status" },
      ],
      sheetName: "Upcoming Renewals",
      fileName: "TKO_Fleet_Renewals",
      title: "Upcoming Renewals (Next 60 Days)",
      totalRow: false,
    });
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading fleet report...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#1A3A5C]">Fleet Report</h1>
      </div>

      {/* Upcoming Renewals */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Upcoming Renewals (Next 60 Days)</CardTitle>
          <Button variant="outline" size="sm" onClick={handleDownloadRenewals}>
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
        </CardHeader>
        <CardContent>
          {renewals.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No upcoming renewals</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3">Vehicle</th>
                    <th className="text-left p-3">Document</th>
                    <th className="text-left p-3">Expiry</th>
                    <th className="text-right p-3">Days Left</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {renewals.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <Link href={`/fleet/${r.vehicle_id}`} className="font-medium text-[#1A3A5C] hover:underline">
                          {r.plate_number}
                        </Link>
                      </td>
                      <td className="p-3">{r.doc_type}</td>
                      <td className="p-3 text-xs">{new Date(r.expiry_date).toLocaleDateString("en-MY")}</td>
                      <td className={`p-3 text-right font-mono ${r.days_remaining < 0 ? "text-red-600 font-bold" : r.days_remaining <= 14 ? "text-yellow-600" : ""}`}>
                        {r.days_remaining < 0 ? "EXPIRED" : r.days_remaining}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={
                            r.status === "expired" ? "bg-red-100 text-red-700"
                            : r.status === "expiring_soon" ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                          }
                        >
                          {r.status === "expiring_soon" ? "Expiring" : r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Costs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Maintenance Costs by Vehicle</CardTitle>
        </CardHeader>
        <CardContent>
          {costs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No maintenance costs recorded</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3">Vehicle</th>
                    <th className="text-right p-3">This Month</th>
                    <th className="text-right p-3">Last 3 Months</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr key={c.plate_number} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{c.plate_number}</td>
                      <td className="p-3 text-right font-mono">RM {c.this_month.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono">RM {c.last_3_months.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="p-3">TOTAL</td>
                    <td className="p-3 text-right font-mono">RM {costs.reduce((s, c) => s + c.this_month, 0).toFixed(2)}</td>
                    <td className="p-3 text-right font-mono">RM {costs.reduce((s, c) => s + c.last_3_months, 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
