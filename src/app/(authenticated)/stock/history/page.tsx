"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StockLocation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sortStockLocations } from "@/lib/stock-sort";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface HistoryPoint {
  date: string;
  [key: string]: string | number | null;
}

const COLORS = [
  "#0D7377",
  "#E8A030",
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0284c7",
];

export default function StockHistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([]);
  const [chartData, setChartData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  // Default date range: last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [dateFrom, setDateFrom] = useState(
    thirtyDaysAgo.toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().split("T")[0]
  );

  const loadLocations = useCallback(async () => {
    const { data } = await supabase
      .from("stock_locations")
      .select("*")
      .order("code");
    if (data) {
      const locs = sortStockLocations(data as StockLocation[]);
      setLocations(locs);
      // Default: select first tank
      const firstTank = locs.find((l) => l.type === "tank");
      if (firstTank) setSelectedLocIds([firstTank.id]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const loadChartData = useCallback(async () => {
    if (selectedLocIds.length === 0) {
      setChartData([]);
      return;
    }

    setChartLoading(true);

    const { data } = await supabase
      .from("stock_history")
      .select("date, closing_balance, location_id")
      .in("location_id", selectedLocIds)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date");

    if (data) {
      // Group by date
      const dateMap = new Map<string, HistoryPoint>();
      for (const row of data) {
        const loc = locations.find((l) => l.id === row.location_id);
        const locName = loc?.name || loc?.code || row.location_id;
        if (!dateMap.has(row.date)) {
          dateMap.set(row.date, { date: row.date });
        }
        const point = dateMap.get(row.date)!;
        point[locName] = row.closing_balance;
      }
      setChartData(
        Array.from(dateMap.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        )
      );
    }

    setChartLoading(false);
  }, [supabase, selectedLocIds, dateFrom, dateTo, locations]);

  useEffect(() => {
    if (!loading) loadChartData();
  }, [loading, loadChartData]);

  function toggleLocation(id: string) {
    setSelectedLocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  const selectedLocNames = selectedLocIds.map((id) => {
    const loc = locations.find((l) => l.id === id);
    return loc?.name || loc?.code || "";
  });

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/stock">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-primary">Stock History</h1>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Add Location</label>
              <Select
                onValueChange={(id: string | null) => {
                  if (id && !selectedLocIds.includes(id)) {
                    setSelectedLocIds((prev) => [...prev, id]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location">{(v: string | null) => { if (!v) return "Select location"; return locations.find((l) => l.id === v)?.name || locations.find((l) => l.id === v)?.code || v; }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter((l) => !selectedLocIds.includes(l.id))
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id} label={l.name || l.code}>
                        {l.name || l.code}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selected locations chips */}
          {selectedLocIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedLocIds.map((id, i) => {
                const loc = locations.find((l) => l.id === id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleLocation(id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  >
                    {loc?.name || loc?.code}
                    <span className="ml-1">&times;</span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Balance Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              Loading chart...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              {selectedLocIds.length === 0
                ? "Select at least one location"
                : "No history data for selected range"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-MY", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  fontSize={12}
                />
                <Tooltip
                  labelFormatter={(d) =>
                    new Date(d as string).toLocaleDateString("en-MY")
                  }
                  formatter={(value) => [
                    `${Number(value ?? 0).toLocaleString()}L`,
                  ]}
                />
                <Legend />
                {selectedLocNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
