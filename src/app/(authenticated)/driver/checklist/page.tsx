"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Vehicle } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, ImagePlus, Loader2, Trash2, XCircle } from "lucide-react";

const CHECKLIST_ITEMS = [
  { key: "tyres_ok", label: "Tyres" },
  { key: "lights_ok", label: "Lights" },
  { key: "brakes_ok", label: "Brakes" },
  { key: "engine_oil_ok", label: "Engine Oil Level" },
  { key: "coolant_ok", label: "Coolant Water" },
  { key: "battery_water_ok", label: "Battery Water" },
  { key: "fire_extinguisher_ok", label: "Fire Extinguisher" },
  { key: "compartment_ok", label: "Compartment Check" },
] as const;

export default function DriverChecklistPage() {
  const supabase = useMemo(() => createClient(), []);
  const { driverProfile } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [odometer, setOdometer] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const item of CHECKLIST_ITEMS) defaults[item.key] = false;
    return defaults;
  });
  const [issuesFound, setIssuesFound] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedVehicleData = vehicles.find((v) => v.id === selectedVehicle);
  const isSmallRoadTanker = selectedVehicleData?.type === "Small Tanker";

  const loadVehicles = useCallback(async () => {
    if (!driverProfile?.id) { setLoading(false); return; }

    const isDriver = driverProfile.role === "driver";

    if (isDriver) {
      const { data: assignments } = await supabase
        .from("driver_vehicle_assignments")
        .select("vehicle_id")
        .eq("driver_id", driverProfile.id);

      const vehicleIds = (assignments ?? []).map((a: { vehicle_id: string }) => a.vehicle_id);

      if (vehicleIds.length > 0) {
        const { data } = await supabase
          .from("vehicles")
          .select("*")
          .in("id", vehicleIds)
          .eq("is_active", true)
          .order("plate_number");
        if (data) {
          setVehicles(data);
          if (data.length === 1) setSelectedVehicle(data[0].id);
        }
      }
    } else {
      const { data } = await supabase
        .from("vehicles")
        .select("*")
        .eq("is_active", true)
        .order("plate_number");
      if (data) setVehicles(data);
    }

    setLoading(false);
  }, [supabase, driverProfile]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  function handlePhotoAdd(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files);
    setPhotos((prev) => [...prev, ...newFiles]);
    // Generate previews
    for (const file of newFiles) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  const hasDefect = Object.values(checks).some((v) => !v);

  async function handleSubmit() {
    if (!selectedVehicle) { setError("Please select a vehicle"); return; }
    if (!odometer) { setError("Please enter ODO reading"); return; }
    if (isSmallRoadTanker && !meterReading) { setError("Please enter meter reading"); return; }

    setSaving(true);
    setError("");

    // Upload photos
    const uploadedUrls: string[] = [];
    for (const photo of photos) {
      const ext = photo.name.split(".").pop();
      const path = `checklists/${driverProfile?.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("fleet-docs")
        .upload(path, photo);
      if (uploadErr) {
        setError(`Photo upload failed: ${uploadErr.message}`);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("fleet-docs").getPublicUrl(path);
      uploadedUrls.push(urlData.publicUrl);
    }

    const { error: insertErr } = await supabase.from("driver_checklists").insert({
      driver_id: driverProfile?.id,
      vehicle_id: selectedVehicle,
      check_date: new Date().toISOString(),
      odometer: parseInt(odometer),
      meter_reading: isSmallRoadTanker && meterReading ? parseFloat(meterReading) : null,
      ...checks,
      has_defect: hasDefect,
      defect_details: hasDefect ? issuesFound || null : null,
      issues_found: issuesFound || null,
      defect_photo_url: uploadedUrls[0] || null,
      photo_urls: uploadedUrls,
    });

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    // Send WhatsApp alerts via API
    const vehicle = vehicles.find((v) => v.id === selectedVehicle);
    try {
      await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: selectedVehicle,
          plateNumber: vehicle?.plate_number,
          driverName: driverProfile?.name,
          odometer: parseInt(odometer),
          hasDefect,
          defectDetails: hasDefect ? issuesFound : null,
        }),
      });
    } catch {
      // Alert failure shouldn't block checklist submission
    }

    setSaving(false);
    setSuccess(true);
  }

  function resetForm() {
    setSuccess(false);
    setOdometer("");
    setMeterReading("");
    const defaults: Record<string, boolean> = {};
    for (const item of CHECKLIST_ITEMS) defaults[item.key] = false;
    setChecks(defaults);
    setIssuesFound("");
    setPhotos([]);
    setPhotoPreviews([]);
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  if (success) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <CheckCircle2 className="w-16 h-16 text-status-approved-fg mb-4" />
        <h2 className="text-2xl font-bold text-status-approved-fg mb-2">Checklist Submitted!</h2>
        <p className="text-muted-foreground mb-6">Your daily inspection has been recorded.</p>
        <div className="flex gap-3">
          <Button onClick={resetForm}>New Checklist</Button>
          <Link href="/driver">
            <Button variant="outline">Back to Portal</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/driver">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-primary">Daily Checklist</h1>
      </div>

      {/* Vehicle Selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Select Vehicle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVehicle(v.id)}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  selectedVehicle === v.id
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <p className="font-bold text-sm">{v.plate_number}</p>
                <p className="text-xs text-muted-foreground">{v.type || ""}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ODO Reading + Meter Reading */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Readings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium">ODO Reading *</label>
            <Input
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="Enter current ODO"
              className="text-lg h-12"
            />
          </div>
          {isSmallRoadTanker && (
            <div>
              <label className="text-sm font-medium">Meter Reading *</label>
              <Input
                type="number"
                step="0.01"
                value={meterReading}
                onChange={(e) => setMeterReading(e.target.value)}
                placeholder="Enter meter reading"
                className="text-lg h-12"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist Items */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inspection Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2 rounded-lg bg-muted">
              <span className="font-medium">{item.label}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setChecks((p) => ({ ...p, [item.key]: true }))}
                  className={`p-2 rounded-lg transition-colors h-11 w-11 flex items-center justify-center ${
                    checks[item.key]
                      ? "bg-status-approved-fg text-white"
                      : "bg-background border text-muted-foreground"
                  }`}
                >
                  <CheckCircle2 className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setChecks((p) => ({ ...p, [item.key]: false }))}
                  className={`p-2 rounded-lg transition-colors h-11 w-11 flex items-center justify-center ${
                    !checks[item.key]
                      ? "bg-destructive text-white"
                      : "bg-background border text-muted-foreground"
                  }`}
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Issues Found */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Issues Found</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={issuesFound}
            onChange={(e) => setIssuesFound(e.target.value)}
            placeholder="Describe any issues found (optional)..."
            className="min-h-[80px] resize-y"
          />
        </CardContent>
      </Card>

      {/* Photo Proof */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Photo Proof</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Photo previews */}
          {photoPreviews.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photoPreviews.map((src, i) => (
                <div key={i} className="relative group">
                  <img
                    src={src}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-24 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer">
            <div className="flex items-center gap-2 bg-muted border border-dashed rounded-lg px-4 py-3 hover:bg-muted/70 w-full justify-center">
              <ImagePlus className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {photos.length > 0 ? "Add More Photos" : "Add Photos"}
              </span>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="sr-only"
              onChange={(e) => handlePhotoAdd(e.target.files)}
            />
          </label>
          {photos.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">{photos.length} photo{photos.length !== 1 ? "s" : ""} selected</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        className="w-full h-14 text-lg bg-status-approved-fg hover:bg-status-approved-fg/90"
        disabled={saving}
      >
        {saving ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit Checklist"
        )}
      </Button>
    </div>
  );
}
