"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle, Driver, FleetDocument } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Search } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

const VEHICLE_TYPES = [
  "Road Tanker",
  "Mini Tanker",
  "Small Tanker",
  "Trailer",
  "Car",
  "Excavator",
  "Others",
];

const DOC_TYPES = ["Road Tax", "Insurance", "Puspakom", "APAD", "Calibration"];

// Group order: 1=Road Tanker/Mini Tanker/Trailer, 2=Small Tanker, 3=Car/Excavator, 4=Others
function getGroupOrder(type: string | null): number {
  if (!type) return 4;
  if (["Road Tanker", "Mini Tanker", "Trailer"].includes(type)) return 1;
  if (["Small Tanker"].includes(type)) return 2;
  if (["Car", "Excavator"].includes(type)) return 3;
  return 4;
}

function getGroupLabel(type: string | null): string {
  const order = getGroupOrder(type);
  if (order === 1) return "Tanker & Trailer";
  if (order === 2) return "Small Tanker";
  if (order === 3) return "Car";
  return "Others";
}

// Document tracker helpers
function cellColor(doc: FleetDocument | undefined): string {
  if (!doc) return "";
  const days = doc.days_remaining ?? 999;
  if (days < 0) return "bg-destructive/10";
  if (days <= 7) return "bg-destructive/10";
  if (days <= 30) return "bg-status-pending-bg";
  return "bg-status-approved-bg";
}

function cellDot(doc: FleetDocument | undefined): { color: string; label: string } | null {
  if (!doc) return null;
  const days = doc.days_remaining ?? 999;
  if (days < 0) return { color: "bg-destructive", label: "Expired" };
  if (days <= 7) return { color: "bg-destructive", label: "Critical" };
  if (days <= 30) return { color: "bg-status-pending-fg", label: "Expiring" };
  return { color: "bg-status-approved-fg", label: "Valid" };
}

export default function FleetPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role } = useAuth();
  const canAdd = role === "admin" || role === "manager";
  const canEdit = role === "admin" || role === "manager" || role === "office";

  // Vehicles state
  const [vehicles, setVehicles] = useState<(Vehicle & { assigned_driver?: string })[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<FleetDocument[]>([]);
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);

  // Form state
  const [plate, setPlate] = useState("");
  const [vType, setVType] = useState("");
  const [capacity, setCapacity] = useState("");
  const [owner, setOwner] = useState("Company");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [vRes, dRes, docRes] = await Promise.all([
      supabase.from("vehicles").select("*").order("plate_number"),
      supabase.from("drivers").select("id, name, assigned_vehicle_id").eq("is_active", true),
      supabase.from("fleet_documents").select("*"),
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
    if (docRes.data) setDocuments(docRes.data);
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

  // Vehicles tab data
  const filteredVehicles = vehicles
    .filter((v) => v.plate_number.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const groupDiff = getGroupOrder(a.type) - getGroupOrder(b.type);
      if (groupDiff !== 0) return groupDiff;
      return a.plate_number.localeCompare(b.plate_number);
    });

  // Document tracker data (exclude "Others")
  const docMap = new Map<string, Map<string, FleetDocument>>();
  for (const doc of documents) {
    if (!docMap.has(doc.vehicle_id)) docMap.set(doc.vehicle_id, new Map());
    const existing = docMap.get(doc.vehicle_id)!.get(doc.doc_type);
    // Always keep the record with the latest expiry date
    if (!existing || (doc.expiry_date ?? "") > (existing.expiry_date ?? "")) {
      docMap.get(doc.vehicle_id)!.set(doc.doc_type, doc);
    }
  }

  const docVehicles = vehicles
    .filter((v) => v.is_active && v.type !== "Others")
    .sort((a, b) => {
      const groupDiff = getGroupOrder(a.type) - getGroupOrder(b.type);
      if (groupDiff !== 0) return groupDiff;
      return a.plate_number.localeCompare(b.plate_number);
    });

  const docFilteredVehicles = showExpiringOnly
    ? docVehicles.filter((v) => {
        const vDocs = docMap.get(v.id);
        if (!vDocs) return false;
        return Array.from(vDocs.values()).some(
          (d) => (d.days_remaining ?? 999) <= 30
        );
      })
    : docVehicles;

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold text-primary">Fleet Management</h1>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Document Tracker</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles ({vehicles.length})</TabsTrigger>
        </TabsList>

        {/* Document Tracker Tab */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              variant={showExpiringOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowExpiringOnly(!showExpiringOnly)}
              className={showExpiringOnly ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {showExpiringOnly ? "Showing Expiring Only" : "Show Expiring Only"}
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted z-10 text-xs">Vehicle</th>
                  {DOC_TYPES.map((dt) => (
                    <th key={dt} className="text-center px-2 py-2 text-xs whitespace-nowrap">{dt}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docFilteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={DOC_TYPES.length + 1} className="text-center p-4 text-muted-foreground text-xs">
                      {showExpiringOnly ? "No expiring documents" : "No vehicles"}
                    </td>
                  </tr>
                ) : (
                  docFilteredVehicles.map((v, idx) => {
                    const vDocs = docMap.get(v.id);
                    const prevGroup = idx > 0 ? getGroupLabel(docFilteredVehicles[idx - 1].type) : null;
                    const currentGroup = getGroupLabel(v.type);
                    const showHeader = currentGroup !== prevGroup;

                    return (
                      <React.Fragment key={v.id}>
                        {showHeader && (
                          <tr className="bg-muted/70">
                            <td colSpan={DOC_TYPES.length + 1} className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              {currentGroup}
                            </td>
                          </tr>
                        )}
                        <tr className="border-b hover:bg-muted/50">
                          <td className="px-3 py-1.5 font-semibold sticky left-0 bg-background z-10 text-xs">
                            <Link href={`/fleet/${v.id}`} className="text-primary hover:underline">
                              {v.plate_number}
                            </Link>
                          </td>
                          {DOC_TYPES.map((dt) => {
                            const doc = vDocs?.get(dt);
                            const dot = doc ? cellDot(doc) : null;
                            return (
                              <td key={dt} className={`px-2 py-1.5 text-center ${cellColor(doc)}`}>
                                {doc ? (
                                  <Link href={`/fleet/${v.id}`} className="flex items-center justify-center gap-1.5 hover:opacity-80">
                                    {dot && <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot.color}`} title={dot.label} />}
                                    <span className="text-xs whitespace-nowrap">
                                      {doc.expiry_date
                                        ? new Date(doc.expiry_date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "2-digit" })
                                        : "—"}
                                    </span>
                                    {doc.days_remaining != null && (
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                        ({doc.days_remaining < 0 ? `-${Math.abs(doc.days_remaining)}d` : `${doc.days_remaining}d`})
                                      </span>
                                    )}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-status-approved-fg" /> &gt;30 days</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-status-pending-fg" /> 7-30 days</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive" /> &lt;7 days or expired</span>
          </div>
        </TabsContent>

        {/* Vehicles Tab */}
        <TabsContent value="vehicles" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Card className="flex-1">
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
            {canAdd && (
              <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={openAdd}>
                <Plus className="w-4 h-4 mr-1" /> Add Vehicle
              </Button>
            )}
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left p-3">Plate Number</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-right p-3">Capacity</th>
                  <th className="text-left p-3">Owner</th>
                  <th className="text-left p-3">Assigned Driver</th>
                  <th className="text-left p-3">Status</th>
                  {canEdit && <th className="text-right p-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 7 : 6} className="text-center p-6 text-muted-foreground">
                      No vehicles found
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((v, idx) => {
                    const prevGroup = idx > 0 ? getGroupLabel(filteredVehicles[idx - 1].type) : null;
                    const currentGroup = getGroupLabel(v.type);
                    const showHeader = currentGroup !== prevGroup;

                    return (
                      <React.Fragment key={v.id}>
                        {showHeader && (
                          <tr className="bg-muted/70">
                            <td colSpan={canEdit ? 7 : 6} className="p-2 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              {currentGroup}
                            </td>
                          </tr>
                        )}
                        <tr className="border-b hover:bg-muted">
                          <td className="p-3">
                            <Link
                              href={`/fleet/${v.id}`}
                              className="font-semibold text-primary hover:underline"
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
                          {canEdit && (
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(v)}
                              >
                                Edit
                              </Button>
                            </td>
                          )}
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Vehicle Add/Edit Dialog */}
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
                    <SelectItem key={t} value={t} label={t}>{t}</SelectItem>
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
                    <SelectItem value="Company" label="Company">Company</SelectItem>
                    <SelectItem value="Partner" label="Partner">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</p>
            )}
            <Button
              onClick={handleSave}
              className="w-full bg-primary hover:bg-primary/90"
              disabled={saving}
            >
              {saving ? "Saving..." : editVehicle ? "Update" : "Add Vehicle"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
