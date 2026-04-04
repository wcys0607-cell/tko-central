"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StockLocation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { ArrowLeft, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { sortStockLocations } from "@/lib/stock-sort";

function varianceColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 2) return "text-status-approved-fg";
  if (abs <= 5) return "text-status-pending-fg";
  return "text-destructive";
}

interface StockTakeEntry {
  locationId: string;
  locationName: string;
  locationType: string;
  systemBalance: number;
  measured: string;
}

export default function NewStockTakePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [entries, setEntries] = useState<StockTakeEntry[]>([]);
  const [takeDate, setTakeDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionPhotos, setSessionPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("stock_locations")
      .select("*")
      .order("code");

    if (data) {
      const sorted = sortStockLocations(data as StockLocation[]);
      setLocations(sorted);
      setEntries(
        sorted.map((l: StockLocation) => ({
          locationId: l.id,
          locationName: l.name || l.code,
          locationType: l.type ?? "tank",
          systemBalance: l.current_balance ?? 0,
          measured: "",
        }))
      );
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

      router.push("/stock/stock-take");
    }

    setSaving(false);
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/stock/stock-take">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-primary">New Stock Take</h1>
      </div>

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

          {/* Remark & Photos */}
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
    </div>
  );
}
