"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StockLocation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft, Camera, X } from "lucide-react";
import { toast } from "sonner";

interface StockTakeEntry {
  locationId: string;
  locationName: string;
  locationType: string;
  systemBalance: number;
  measured: string;
}

interface SessionRow {
  id: string;
  date: string;
  created_at: string;
  notes: string | null;
  photos: string[];
  takerName: string | null;
  measurements: Record<string, number | null>; // location_id -> measured_liters
}

interface DetailEntry {
  locationName: string;
  locationType: string;
  measured: number;
  system: number;
  variance: number;
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
  const [entries, setEntries] = useState<StockTakeEntry[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [takeDate, setTakeDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionPhotos, setSessionPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [detailEntries, setDetailEntries] = useState<DetailEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // All locations for pivot table columns (ordered: tanks, drum, vehicles, meter)
  const pivotLocations = useMemo(
    () =>
      [...locations].sort((a, b) => {
        const order: Record<string, number> = {
          tank: 1,
          drum: 2,
          vehicle: 3,
          meter: 4,
        };
        const oa = order[a.type ?? "tank"] ?? 5;
        const ob = order[b.type ?? "tank"] ?? 5;
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

    if (locRes.data) {
      setLocations(locRes.data);
      setEntries(
        locRes.data.map((l: StockLocation) => ({
          locationId: l.id,
          locationName: l.name || l.code,
          locationType: l.type ?? "tank",
          systemBalance: l.current_balance ?? 0,
          measured: "",
        }))
      );
    }

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

  function updateMeasured(idx: number, value: string) {
    setEntries((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], measured: value };
      return copy;
    });
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setSessionPhotos((prev) => [...prev, ...files]);
    setPhotoPreviewUrls((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    URL.revokeObjectURL(photoPreviewUrls[idx]);
    setSessionPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviewUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  async function openSessionDetail(session: SessionRow) {
    setSelectedSession(session);
    setDetailLoading(true);

    const { data } = await supabase
      .from("stock_takes")
      .select("location_id, measured_liters, system_liters, variance, location:stock_locations!stock_takes_location_id_fkey(name, code, type)")
      .eq("session_id", session.id);

    if (data) {
      setDetailEntries(
        data.map((d: Record<string, unknown>) => {
          const loc = d.location as { name?: string; code?: string; type?: string } | null;
          return {
            locationName: loc?.name || loc?.code || "—",
            locationType: loc?.type ?? "tank",
            measured: (d.measured_liters as number) ?? 0,
            system: (d.system_liters as number) ?? 0,
            variance: (d.variance as number) ?? 0,
          };
        })
      );
    }
    setDetailLoading(false);
  }

  async function handleSave() {
    setError("");

    const filledEntries = entries.filter((e) => e.measured.trim() !== "");
    if (filledEntries.length === 0) {
      setError("Please enter at least one measurement");
      return;
    }

    setSaving(true);

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

    // Upload photos
    const photoUrls: string[] = [];
    for (const file of sessionPhotos) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${takeDate}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("stock-takes")
        .upload(path, file);
      if (!uploadErr) {
        const { data: urlData } = supabase.storage
          .from("stock-takes")
          .getPublicUrl(path);
        photoUrls.push(urlData.publicUrl);
      }
    }

    // Create session
    const { data: session, error: sessionErr } = await supabase
      .from("stock_take_sessions")
      .insert({
        date: takeDate,
        notes: sessionNotes || null,
        photos: photoUrls,
        taken_by: driverId,
      })
      .select("id")
      .single();

    if (sessionErr || !session) {
      toast.error(sessionErr?.message ?? "Failed to create session");
      setError(sessionErr?.message ?? "Failed to create session");
      setSaving(false);
      return;
    }

    const rows = filledEntries.map((e) => {
      const measured = Math.round(parseFloat(e.measured));
      const isMeter = e.locationType === "meter";
      const variance = isMeter ? 0 : measured - Math.round(e.systemBalance);
      return {
        date: takeDate,
        session_id: session.id,
        location_id: e.locationId,
        measured_liters: measured,
        system_liters: isMeter ? 0 : e.systemBalance,
        variance,
        taken_by: driverId,
        notes: null,
        _isMeter: isMeter,
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const dbRows = rows.map(({ _isMeter, ...rest }) => rest);

    const { error: insertError } = await supabase
      .from("stock_takes")
      .insert(dbRows);

    if (insertError) {
      toast.error(insertError.message);
      setError(insertError.message);
    } else {
      let adjustmentCount = 0;
      for (const row of rows) {
        if (row._isMeter || row.variance === 0) continue;

        const isPositive = row.variance > 0;

        await supabase.from("stock_transactions").insert({
          transaction_date: new Date(`${takeDate}T12:00:00`).toISOString(),
          type: "adjustment",
          source_location_id: isPositive ? null : row.location_id,
          dest_location_id: isPositive ? row.location_id : null,
          quantity_liters: Math.abs(row.variance),
          price_per_liter: null,
          owner:
            locations.find((l) => l.id === row.location_id)?.owner ?? "Company",
          reference: `Stock Take ${takeDate}`,
          notes: `Stock take adjustment: system ${row.system_liters}L → measured ${row.measured_liters}L`,
          created_by: driverId,
        });

        await supabase
          .from("stock_locations")
          .update({
            current_balance: row.measured_liters,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.location_id);

        adjustmentCount++;
      }

      if (adjustmentCount > 0) {
        toast.success(
          `${rows.length} stock take${rows.length > 1 ? "s" : ""} saved, ${adjustmentCount} adjustment${adjustmentCount > 1 ? "s" : ""} created`
        );
      } else {
        toast.success(
          `${rows.length} stock take${rows.length > 1 ? "s" : ""} saved — no variance`
        );
      }

      setSessionNotes("");
      setSessionPhotos([]);
      setPhotoPreviewUrls([]);
      await load();
    }

    setSaving(false);
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/stock">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-primary">Stock Take</h1>
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New Stock Take</TabsTrigger>
          <TabsTrigger value="history">
            History ({sessions.length})
          </TabsTrigger>
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
              {/* Tanks (including Drum Storage) */}
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b">
                    <tr>
                      <th className="text-left p-3">Location</th>
                      <th className="text-right p-3">System (L)</th>
                      <th className="text-right p-3">Measured (L)</th>
                      <th className="text-right p-3">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => {
                      if (
                        entry.locationType !== "tank" &&
                        entry.locationType !== "drum"
                      )
                        return null;
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
                              step="1"
                              value={entry.measured}
                              onChange={(e) =>
                                updateMeasured(idx, e.target.value)
                              }
                              placeholder="0"
                              className="w-[120px] ml-auto text-right"
                            />
                          </td>
                          <td className="p-3 text-right">
                            {hasValue ? (
                              <span
                                className={`font-mono font-semibold ${varianceColor(variancePct)}`}
                              >
                                {variance > 0 ? "+" : ""}
                                {Math.round(variance).toLocaleString()}L (
                                {variancePct.toFixed(1)}%)
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Vehicles */}
              {entries.some((e) => e.locationType === "vehicle") && (
                <div className="border rounded-lg overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-muted border-b">
                      <tr>
                        <th className="text-left p-3">Vehicle</th>
                        <th className="text-right p-3">System (L)</th>
                        <th className="text-right p-3">Measured (L)</th>
                        <th className="text-right p-3">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => {
                        if (entry.locationType !== "vehicle") return null;
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
                                step="1"
                                value={entry.measured}
                                onChange={(e) =>
                                  updateMeasured(idx, e.target.value)
                                }
                                placeholder="0"
                                className="w-[120px] ml-auto text-right"
                              />
                            </td>
                            <td className="p-3 text-right">
                              {hasValue ? (
                                <span
                                  className={`font-mono font-semibold ${varianceColor(variancePct)}`}
                                >
                                  {variance > 0 ? "+" : ""}
                                  {Math.round(variance).toLocaleString()}L (
                                  {variancePct.toFixed(1)}%)
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Meter Reading */}
              {entries.some((e) => e.locationType === "meter") && (
                <div className="border rounded-lg overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-muted border-b">
                      <tr>
                        <th className="text-left p-3">Meter</th>
                        <th className="text-right p-3">Reading</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => {
                        if (entry.locationType !== "meter") return null;
                        return (
                          <tr key={entry.locationId} className="border-b">
                            <td className="p-3 font-medium">
                              {entry.locationName}
                            </td>
                            <td className="p-3">
                              <Input
                                type="number"
                                step="1"
                                value={entry.measured}
                                onChange={(e) =>
                                  updateMeasured(idx, e.target.value)
                                }
                                placeholder="0"
                                className="w-[120px] ml-auto text-right"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Session Note & Photos */}
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Remark
                  </label>
                  <Textarea
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Add remark for this stock take..."
                    rows={4}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Photos
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {photoPreviewUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative w-20 h-20 rounded-md overflow-hidden border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <Camera className="w-5 h-5" />
                      <span className="text-[10px] mt-0.5">Add</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md mt-4">
                  {error}
                </p>
              )}

              <Button
                onClick={handleSave}
                className="mt-4 bg-primary hover:bg-primary/90"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Stock Take"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
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
                        {new Date(session.created_at).toLocaleTimeString(
                          "en-MY",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          }
                        )}
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
        </TabsContent>
      </Tabs>

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
                                  {Math.round(
                                    entry.variance
                                  ).toLocaleString()}
                                  L ({pct.toFixed(1)}%)
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

              {/* Notes */}
              {selectedSession.notes && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">Remark</p>
                  <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">
                    {selectedSession.notes}
                  </div>
                </div>
              )}

              {/* Photos */}
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
