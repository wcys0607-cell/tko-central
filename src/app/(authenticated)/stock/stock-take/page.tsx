"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StockLocation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

interface SessionRow {
  id: string;
  date: string;
  created_at: string;
  notes: string | null;
  photos: string[];
  takerName: string | null;
  measurements: Record<string, number | null>;
}

interface DetailEntry {
  locationName: string;
  locationType: string;
  locationCode: string;
  measured: number;
  system: number;
  variance: number;
}

const TYPE_ORDER: Record<string, number> = {
  tank: 1,
  drum: 2,
  vehicle: 3,
  meter: 4,
};

function sortByLocationOrder(
  a: { locationType: string; locationCode: string },
  b: { locationType: string; locationCode: string }
) {
  const oa = TYPE_ORDER[a.locationType] ?? 5;
  const ob = TYPE_ORDER[b.locationType] ?? 5;
  if (oa !== ob) return oa - ob;
  return a.locationCode.localeCompare(b.locationCode);
}

function varianceColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 2) return "text-status-approved-fg";
  if (abs <= 5) return "text-status-pending-fg";
  return "text-destructive";
}

export default function StockTakePage() {
  const supabase = useMemo(() => createClient(), []);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(
    null
  );
  const [detailEntries, setDetailEntries] = useState<DetailEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const pivotLocations = useMemo(
    () =>
      [...locations].sort((a, b) => {
        const oa = TYPE_ORDER[a.type ?? "tank"] ?? 5;
        const ob = TYPE_ORDER[b.type ?? "tank"] ?? 5;
        if (oa !== ob) return oa - ob;
        return (a.code ?? "").localeCompare(b.code ?? "");
      }),
    [locations]
  );

  const load = useCallback(async () => {
    const [locRes, sessionRes] = await Promise.all([
      supabase.from("stock_locations").select("*").order("code"),
      supabase
        .from("stock_take_sessions")
        .select(
          "*, taker:drivers!stock_take_sessions_taken_by_fkey(id, name)"
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (locRes.data) setLocations(locRes.data);

    if (sessionRes.data && sessionRes.data.length > 0) {
      const sessionIds = sessionRes.data.map(
        (s: Record<string, unknown>) => s.id as string
      );
      const { data: takesData } = await supabase
        .from("stock_takes")
        .select("session_id, location_id, measured_liters")
        .in("session_id", sessionIds);

      const measurementMap: Record<string, Record<string, number | null>> = {};
      for (const t of takesData ?? []) {
        if (!t.session_id) continue;
        if (!measurementMap[t.session_id]) measurementMap[t.session_id] = {};
        measurementMap[t.session_id][t.location_id] = t.measured_liters;
      }

      setSessions(
        sessionRes.data.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          date: s.date as string,
          created_at: s.created_at as string,
          notes: s.notes as string | null,
          photos: (s.photos as string[]) ?? [],
          takerName:
            (s.taker as { name?: string } | null)?.name ?? null,
          measurements: measurementMap[s.id as string] ?? {},
        }))
      );
    } else {
      setSessions([]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function openSessionDetail(session: SessionRow) {
    setSelectedSession(session);
    setDetailLoading(true);

    const { data } = await supabase
      .from("stock_takes")
      .select(
        "location_id, measured_liters, system_liters, variance, location:stock_locations!stock_takes_location_id_fkey(name, code, type)"
      )
      .eq("session_id", session.id);

    if (data) {
      const entries = data
        .map((d: Record<string, unknown>) => {
          const loc = d.location as {
            name?: string;
            code?: string;
            type?: string;
          } | null;
          return {
            locationName: loc?.name || loc?.code || "—",
            locationType: loc?.type ?? "tank",
            locationCode: loc?.code ?? "",
            measured: (d.measured_liters as number) ?? 0,
            system: (d.system_liters as number) ?? 0,
            variance: (d.variance as number) ?? 0,
          };
        })
        .sort(sortByLocationOrder);
      setDetailEntries(entries);
    }
    setDetailLoading(false);
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/stock">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-primary">Stock Take</h1>
        </div>
        <Link href="/stock/stock-take/new">
          <Button size="sm" className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1" /> New Stock Take
          </Button>
        </Link>
      </div>

      {/* History Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted border-b">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-muted z-10">
                Date
              </th>
              <th className="text-left p-2">Time</th>
              {pivotLocations.map((loc) => (
                <th key={loc.id} className="text-right p-2">
                  {loc.name || loc.code}
                </th>
              ))}
              <th className="text-left p-2">Note</th>
              <th className="text-left p-2">Photo</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td
                  colSpan={4 + pivotLocations.length}
                  className="text-center p-6 text-muted-foreground"
                >
                  No stock takes yet
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b hover:bg-muted/50 cursor-pointer"
                  onClick={() => openSessionDetail(session)}
                >
                  <td className="p-2 sticky left-0 bg-background font-medium">
                    {new Date(session.date).toLocaleDateString("en-MY", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(session.created_at).toLocaleTimeString("en-MY", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </td>
                  {pivotLocations.map((loc) => {
                    const val = session.measurements[loc.id];
                    const isMeter = loc.type === "meter";
                    return (
                      <td
                        key={loc.id}
                        className="p-2 text-right font-mono text-sm"
                      >
                        {val != null ? (
                          <span>
                            {Math.round(val).toLocaleString()}
                            {!isMeter && "L"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 max-w-[300px] whitespace-pre-wrap text-xs">
                    {session.notes ? (
                      <div className="line-clamp-3" title={session.notes}>
                        {session.notes}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    {session.photos.length > 0 ? (
                      <div className="flex gap-1">
                        {session.photos.map((url, pi) => (
                          <a
                            key={pi}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="block w-8 h-8 rounded overflow-hidden border hover:ring-2 ring-primary flex-shrink-0"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Photo ${pi + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Session Detail Dialog */}
      <Dialog
        open={!!selectedSession}
        onOpenChange={(open) => {
          if (!open) setSelectedSession(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedSession && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Stock Take —{" "}
                  {new Date(selectedSession.date).toLocaleDateString("en-MY", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-2">
                <span>
                  Time:{" "}
                  {new Date(selectedSession.created_at).toLocaleTimeString(
                    "en-MY",
                    { hour: "2-digit", minute: "2-digit", hour12: true }
                  )}
                </span>
                {selectedSession.takerName && (
                  <span>Taken by: {selectedSession.takerName}</span>
                )}
              </div>

              {detailLoading ? (
                <p className="text-muted-foreground py-4">Loading...</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted border-b">
                      <tr>
                        <th className="text-left p-2.5">Location</th>
                        <th className="text-right p-2.5">System</th>
                        <th className="text-right p-2.5">Measured</th>
                        <th className="text-right p-2.5">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailEntries.map((entry, i) => {
                        const isMeter = entry.locationType === "meter";
                        const pct =
                          !isMeter && entry.system > 0
                            ? (entry.variance / entry.system) * 100
                            : 0;
                        return (
                          <tr key={i} className="border-b">
                            <td className="p-2.5 font-medium">
                              {entry.locationName}
                            </td>
                            <td className="p-2.5 text-right font-mono">
                              {isMeter
                                ? "—"
                                : `${Math.round(entry.system).toLocaleString()}L`}
                            </td>
                            <td className="p-2.5 text-right font-mono">
                              {Math.round(entry.measured).toLocaleString()}
                              {!isMeter && "L"}
                            </td>
                            <td className="p-2.5 text-right">
                              {isMeter ? (
                                "—"
                              ) : (
                                <Badge
                                  variant="outline"
                                  className={varianceColor(pct)}
                                >
                                  {entry.variance > 0 ? "+" : ""}
                                  {Math.round(entry.variance).toLocaleString()}L
                                  ({pct.toFixed(1)}%)
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedSession.notes && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">Remark</p>
                  <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">
                    {selectedSession.notes}
                  </div>
                </div>
              )}

              {selectedSession.photos.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">Photos</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSession.photos.map((url, pi) => (
                      <a
                        key={pi}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-24 h-24 rounded-md overflow-hidden border hover:ring-2 ring-primary"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Photo ${pi + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
