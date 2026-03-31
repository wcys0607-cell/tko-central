"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Vehicle } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, XCircle } from "lucide-react";

const CHECKLIST_ITEMS = [
  { key: "tyres_ok", label: "Tyres" },
  { key: "brakes_ok", label: "Brakes" },
  { key: "engine_oil_ok", label: "Engine Oil" },
  { key: "coolant_ok", label: "Coolant" },
  { key: "lights_ok", label: "Lights" },
  { key: "fire_extinguisher_ok", label: "Fire Extinguisher" },
] as const;

export default function DriverChecklistPage() {
  const supabase = createClient();
  const { driverProfile } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [odometer, setOdometer] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({
    tyres_ok: true,
    brakes_ok: true,
    engine_oil_ok: true,
    coolant_ok: true,
    lights_ok: true,
    fire_extinguisher_ok: true,
  });
  const [defectDetails, setDefectDetails] = useState("");
  const [defectPhoto, setDefectPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadVehicles = useCallback(async () => {
    const { data } = await supabase
      .from("vehicles")
      .select("*")
      .eq("is_active", true)
      .order("plate_number");
    if (data) {
      setVehicles(data);
      // Auto-select assigned vehicle
      if (driverProfile?.id) {
        const { data: driver } = await supabase
          .from("drivers")
          .select("assigned_vehicle_id")
          .eq("id", driverProfile.id)
          .single();
        if (driver?.assigned_vehicle_id) {
          setSelectedVehicle(driver.assigned_vehicle_id);
        }
      }
    }
    setLoading(false);
  }, [supabase, driverProfile]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const hasDefect = Object.values(checks).some((v) => !v);

  async function handleSubmit() {
    if (!selectedVehicle) { setError("Please select a vehicle"); return; }
    if (!odometer) { setError("Please enter ODO reading"); return; }

    setSaving(true);
    setError("");

    let photoUrl: string | null = null;

    // Upload defect photo if exists
    if (defectPhoto && hasDefect) {
      const ext = defectPhoto.name.split(".").pop();
      const path = `checklists/${driverProfile?.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("fleet-docs")
        .upload(path, defectPhoto);
      if (uploadErr) {
        setError(`Photo upload failed: ${uploadErr.message}`);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("fleet-docs").getPublicUrl(path);
      photoUrl = urlData.publicUrl;
    }

    const { error: insertErr } = await supabase.from("driver_checklists").insert({
      driver_id: driverProfile?.id,
      vehicle_id: selectedVehicle,
      check_date: new Date().toISOString(),
      odometer: parseInt(odometer),
      ...checks,
      has_defect: hasDefect,
      defect_details: hasDefect ? defectDetails || null : null,
      defect_photo_url: photoUrl,
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
          defectDetails: hasDefect ? defectDetails : null,
        }),
      });
    } catch {
      // Alert failure shouldn't block checklist submission
    }

    setSaving(false);
    setSuccess(true);
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  if (success) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-green-700 mb-2">Checklist Submitted!</h2>
        <p className="text-muted-foreground mb-6">Your daily inspection has been recorded.</p>
        <div className="flex gap-3">
          <Button onClick={() => {
            setSuccess(false);
            setOdometer("");
            setChecks({
              tyres_ok: true, brakes_ok: true, engine_oil_ok: true,
              coolant_ok: true, lights_ok: true, fire_extinguisher_ok: true,
            });
            setDefectDetails("");
            setDefectPhoto(null);
          }}>
            New Checklist
          </Button>
          <Link href="/driver">
            <Button variant="outline">Back to Portal</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/driver">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#1A3A5C]">Daily Checklist</h1>
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
                    ? "border-[#1A3A5C] bg-[#1A3A5C]/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-bold text-sm">{v.plate_number}</p>
                <p className="text-xs text-muted-foreground">{v.type || ""}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ODO Reading */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ODO Reading</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder="Enter current ODO"
            className="text-lg h-12"
          />
        </CardContent>
      </Card>

      {/* Checklist Items */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inspection Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
              <span className="font-medium">{item.label}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setChecks((p) => ({ ...p, [item.key]: true }))}
                  className={`p-2 rounded-lg transition-colors ${
                    checks[item.key]
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  <CheckCircle2 className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setChecks((p) => ({ ...p, [item.key]: false }))}
                  className={`p-2 rounded-lg transition-colors ${
                    !checks[item.key]
                      ? "bg-red-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Defect Section */}
      {hasDefect && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-700">Defect Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="w-full border rounded-md p-3 text-sm min-h-[100px] resize-y"
              value={defectDetails}
              onChange={(e) => setDefectDetails(e.target.value)}
              placeholder="Describe the defect..."
            />
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="flex items-center gap-2 bg-white border rounded-lg px-4 py-3 hover:bg-gray-50">
                  <Camera className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {defectPhoto ? defectPhoto.name : "Take Photo"}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setDefectPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        className="w-full h-14 text-lg bg-green-600 hover:bg-green-700"
        disabled={saving}
      >
        {saving ? "Submitting..." : "Submit Checklist"}
      </Button>
    </div>
  );
}
