"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StockLocation, StockTake } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface StockTakeEntry {
  locationId: string;
  locationName: string;
  systemBalance: number;
  measured: string;
  notes: string;
}

function varianceColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 2) return "text-green-600";
  if (abs <= 5) return "text-yellow-600";
  return "text-red-600";
}

export default function StockTakePage() {
  const supabase = useMemo(() => createClient(), []);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [entries, setEntries] = useState<StockTakeEntry[]>([]);
  const [history, setHistory] = useState<StockTake[]>([]);
  const [takeDate, setTakeDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [locRes, histRes] = await Promise.all([
      supabase.from("stock_locations").select("*").order("code"),
      supabase
        .from("stock_takes")
        .select(
          "*, location:stock_locations!stock_takes_location_id_fkey(id, code, name), taker:drivers!stock_takes_taken_by_fkey(id, name)"
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (locRes.data) {
      setLocations(locRes.data);
      setEntries(
        locRes.data.map((l: StockLocation) => ({
          locationId: l.id,
          locationName: l.name || l.code,
          systemBalance: l.current_balance ?? 0,
          measured: "",
          notes: "",
        }))
      );
    }
    if (histRes.data) setHistory(histRes.data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function updateEntry(
    idx: number,
    field: "measured" | "notes",
    value: string
  ) {
    setEntries((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  }

  async function handleSave() {
    setError("");
    setSuccess("");

    const filledEntries = entries.filter((e) => e.measured.trim() !== "");
    if (filledEntries.length === 0) {
      setError("Please enter at least one measurement");
      return;
    }

    setSaving(true);

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let driverId: string | null = null;
    if (user) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      driverId = driver?.id ?? null;
    }

    const rows = filledEntries.map((e) => {
      const measured = parseFloat(e.measured);
      const variance = measured - e.systemBalance;
      return {
        date: takeDate,
        location_id: e.locationId,
        measured_liters: measured,
        system_liters: e.systemBalance,
        variance,
        taken_by: driverId,
        notes: e.notes || null,
      };
    });

    const { error: insertError } = await supabase
      .from("stock_takes")
      .insert(rows);

    if (insertError) {
      setError(insertError.message);
    } else {
      setSuccess(
        `${rows.length} stock take${rows.length > 1 ? "s" : ""} saved`
      );
      // Reset entries
      setEntries((prev) =>
        prev.map((e) => ({ ...e, measured: "", notes: "" }))
      );
      // Reload history
      const { data } = await supabase
        .from("stock_takes")
        .select(
          "*, location:stock_locations!stock_takes_location_id_fkey(id, code, name), taker:drivers!stock_takes_taken_by_fkey(id, name)"
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setHistory(data);
    }

    setSaving(false);
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/stock">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-[#1A3A5C]">Stock Take</h1>
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New Stock Take</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Physical Measurement</CardTitle>
                <Input
                  type="date"
                  value={takeDate}
                  onChange={(e) => setTakeDate(e.target.value)}
                  className="w-[180px]"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3">Location</th>
                      <th className="text-right p-3">System (L)</th>
                      <th className="text-right p-3">Measured (L)</th>
                      <th className="text-right p-3">Variance</th>
                      <th className="text-left p-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => {
                      const measured = parseFloat(entry.measured);
                      const hasValue = !isNaN(measured);
                      const variance = hasValue
                        ? measured - entry.systemBalance
                        : 0;
                      const variancePct =
                        hasValue && entry.systemBalance > 0
                          ? (variance / entry.systemBalance) * 100
                          : 0;

                      return (
                        <tr key={entry.locationId} className="border-b">
                          <td className="p-3 font-medium">
                            {entry.locationName}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {entry.systemBalance.toLocaleString()}
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              step="0.01"
                              value={entry.measured}
                              onChange={(e) =>
                                updateEntry(idx, "measured", e.target.value)
                              }
                              placeholder="0.00"
                              className="w-[120px] ml-auto text-right"
                            />
                          </td>
                          <td className="p-3 text-right">
                            {hasValue ? (
                              <span
                                className={`font-mono font-semibold ${varianceColor(variancePct)}`}
                              >
                                {variance > 0 ? "+" : ""}
                                {variance.toLocaleString()}L (
                                {variancePct.toFixed(1)}%)
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-3">
                            <Input
                              value={entry.notes}
                              onChange={(e) =>
                                updateEntry(idx, "notes", e.target.value)
                              }
                              placeholder="Notes"
                              className="w-[150px]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md mt-4">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md mt-4">
                  {success}
                </p>
              )}

              <Button
                onClick={handleSave}
                className="mt-4 bg-[#1A3A5C] hover:bg-[#15304D]"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Stock Take"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Location</th>
                  <th className="text-right p-3">Measured (L)</th>
                  <th className="text-right p-3">System (L)</th>
                  <th className="text-right p-3">Variance</th>
                  <th className="text-left p-3">Taken By</th>
                  <th className="text-left p-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center p-6 text-muted-foreground"
                    >
                      No stock takes yet
                    </td>
                  </tr>
                ) : (
                  history.map((st) => {
                    const pct =
                      (st.system_liters ?? 0) > 0
                        ? ((st.variance ?? 0) / (st.system_liters ?? 1)) * 100
                        : 0;
                    return (
                      <tr key={st.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 whitespace-nowrap">
                          {new Date(st.date).toLocaleDateString("en-MY")}
                        </td>
                        <td className="p-3">
                          {st.location?.name || st.location?.code || "—"}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {st.measured_liters?.toLocaleString() ?? "—"}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {st.system_liters?.toLocaleString() ?? "—"}
                        </td>
                        <td className="p-3 text-right">
                          <Badge
                            className={varianceColor(pct)}
                            variant="outline"
                          >
                            {(st.variance ?? 0) > 0 ? "+" : ""}
                            {(st.variance ?? 0).toLocaleString()}L (
                            {pct.toFixed(1)}%)
                          </Badge>
                        </td>
                        <td className="p-3">{st.taker?.name ?? "—"}</td>
                        <td className="p-3 max-w-[200px] truncate">
                          {st.notes || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
