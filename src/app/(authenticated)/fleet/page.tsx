"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle, Driver } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Plus, FileText, Search } from "lucide-react";

const VEHICLE_TYPES = [
  "Road Tanker",
  "Mini Tanker",
  "Trailer",
  "Car",
  "Excavator",
];

export default function FleetPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<(Vehicle & { assigned_driver?: string })[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);

  // Form state
  const [plate, setPlate] = useState("");
  const [vType, setVType] = useState("");
  const [capacity, setCapacity] = useState("");
  const [owner, setOwner] = useState("Company");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [vRes, dRes] = await Promise.all([
      supabase.from("vehicles").select("*").order("plate_number"),
      supabase.from("drivers").select("id, name, assigned_vehicle_id").eq("is_active", true),
    ]);

    const driverMap = new Map<string, string>();
    for (const d of dRes.data ?? []) {
      if (d.assigned_vehicle_id) driverMap.set(d.assigned_vehicle_id, d.name);
    }

    if (vRes.data) {
      setVehicles(
        vRes.data.map((v: Vehicle) => ({
          ...v,
          assigned_driver: driverMap.get(v.id) ?? undefined,
        }))
      );
    }
    if (dRes.data) setDrivers(dRes.data as Driver[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditVehicle(null);
    setPlate("");
    setVType("");
    setCapacity("");
    setOwner("Company");
    setError("");
    setDialogOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditVehicle(v);
    setPlate(v.plate_number);
    setVType(v.type ?? "");
    setCapacity(v.capacity_liters?.toString() ?? "");
    setOwner(v.owner ?? "Company");
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!plate.trim()) {
      setError("Plate number is required");
      return;
    }
    setSaving(true);
    setError("");

    const data = {
      plate_number: plate.trim().toUpperCase(),
      type: vType || null,
      capacity_liters: capacity ? parseInt(capacity) : null,
      owner: owner || "Company",
    };

    if (editVehicle) {
      const { error: err } = await supabase
        .from("vehicles")
        .update(data)
        .eq("id", editVehicle.id);
      if (err) setError(err.message);
    } else {
      const { error: err } = await supabase.from("vehicles").insert({ ...data, is_active: true });
      if (err) setError(err.message);
    }

    setSaving(false);
    if (!error) {
      setDialogOpen(false);
      load();
    }
  }

  const filtered = vehicles.filter((v) =>
    v.plate_number.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading vehicles...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-[#1A3A5C]">Fleet Management</h1>
        <div className="flex gap-2">
          <Link href="/fleet/documents">
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-1" /> Document Tracker
            </Button>
          </Link>
          <Button size="sm" className="bg-[#1A3A5C] hover:bg-[#15304D]" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> Add Vehicle
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editVehicle ? "Edit Vehicle" : "Add Vehicle"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Plate Number</label>
                  <Input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="JXR6367"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={vType} onValueChange={(v) => v && setVType(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Capacity (L)</label>
                    <Input
                      type="number"
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      placeholder="4600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Owner</label>
                    <Select value={owner} onValueChange={(v) => v && setOwner(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Company">Company</SelectItem>
                        <SelectItem value="Partner">Partner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
                )}
                <Button
                  onClick={handleSave}
                  className="w-full bg-[#1A3A5C] hover:bg-[#15304D]"
                  disabled={saving}
                >
                  {saving ? "Saving..." : editVehicle ? "Update" : "Add Vehicle"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search plate number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3">Plate Number</th>
              <th className="text-left p-3">Type</th>
              <th className="text-right p-3">Capacity</th>
              <th className="text-left p-3">Owner</th>
              <th className="text-left p-3">Assigned Driver</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-6 text-muted-foreground">
                  No vehicles found
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <Link
                      href={`/fleet/${v.id}`}
                      className="font-semibold text-[#1A3A5C] hover:underline"
                    >
                      {v.plate_number}
                    </Link>
                  </td>
                  <td className="p-3">{v.type || "—"}</td>
                  <td className="p-3 text-right">
                    {v.capacity_liters?.toLocaleString() ?? "—"}L
                  </td>
                  <td className="p-3">{v.owner || "—"}</td>
                  <td className="p-3">{v.assigned_driver || "—"}</td>
                  <td className="p-3">
                    <Badge variant={v.is_active ? "default" : "secondary"}>
                      {v.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(v)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
