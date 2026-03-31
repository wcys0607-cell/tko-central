"use client";

import { useEffect, useState, useCallback, use } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle, FleetDocument, MaintenanceLog, DriverChecklist } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Plus, Upload } from "lucide-react";

const DOC_TYPES = ["Road Tax", "Insurance", "Puspakom", "SPAD Permit", "Grant"];
const SERVICE_TYPES = [
  "Engine Oil",
  "Gear Oil",
  "Steering Oil",
  "Diesel Filter",
  "Tyre",
  "Other",
];

function docStatusColor(status: string | null, days: number | null): string {
  if (status === "expired" || (days != null && days < 0)) return "bg-red-100 text-red-800";
  if (status === "expiring_soon" || (days != null && days <= 30)) {
    if (days != null && days <= 7) return "bg-red-100 text-red-800";
    return "bg-yellow-100 text-yellow-800";
  }
  return "bg-green-100 text-green-800";
}

export default function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [documents, setDocuments] = useState<FleetDocument[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceLog[]>([]);
  const [checklists, setChecklists] = useState<DriverChecklist[]>([]);
  const [loading, setLoading] = useState(true);

  // Document dialog
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<FleetDocument | null>(null);
  const [docType, setDocType] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState("");

  // Maintenance dialog
  const [maintDialogOpen, setMaintDialogOpen] = useState(false);
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [odometer, setOdometer] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [nextServiceOdo, setNextServiceOdo] = useState("");
  const [mechanic, setMechanic] = useState("");
  const [cost, setCost] = useState("");
  const [maintNotes, setMaintNotes] = useState("");
  const [maintSaving, setMaintSaving] = useState(false);
  const [maintError, setMaintError] = useState("");

  const load = useCallback(async () => {
    const [vRes, docRes, maintRes, checkRes] = await Promise.all([
      supabase.from("vehicles").select("*").eq("id", id).single(),
      supabase
        .from("fleet_documents")
        .select("*")
        .eq("vehicle_id", id)
        .order("doc_type"),
      supabase
        .from("maintenance_logs")
        .select("*")
        .eq("vehicle_id", id)
        .order("service_date", { ascending: false }),
      supabase
        .from("driver_checklists")
        .select("*, driver:drivers!driver_checklists_driver_id_fkey(id, name)")
        .eq("vehicle_id", id)
        .order("check_date", { ascending: false })
        .limit(50),
    ]);

    if (vRes.data) setVehicle(vRes.data);
    if (docRes.data) setDocuments(docRes.data);
    if (maintRes.data) setMaintenance(maintRes.data);
    if (checkRes.data) setChecklists(checkRes.data);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  function openAddDoc() {
    setEditDoc(null);
    setDocType("");
    setExpiryDate("");
    setDocFile(null);
    setDocError("");
    setDocDialogOpen(true);
  }

  function openEditDoc(doc: FleetDocument) {
    setEditDoc(doc);
    setDocType(doc.doc_type);
    setExpiryDate(doc.expiry_date ?? "");
    setDocFile(null);
    setDocError("");
    setDocDialogOpen(true);
  }

  async function handleSaveDoc() {
    if (!docType) { setDocError("Select document type"); return; }
    if (!expiryDate) { setDocError("Enter expiry date"); return; }
    setDocSaving(true);
    setDocError("");

    let docUrl = editDoc?.document_url ?? null;

    // Upload file if provided
    if (docFile) {
      const ext = docFile.name.split(".").pop();
      const path = `documents/${id}/${docType.replace(/\s/g, "_")}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("fleet-docs")
        .upload(path, docFile);
      if (uploadErr) {
        setDocError(`Upload failed: ${uploadErr.message}`);
        setDocSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("fleet-docs").getPublicUrl(path);
      docUrl = urlData.publicUrl;
    }

    const today = new Date().toISOString().split("T")[0];
    const daysRemaining = Math.ceil(
      (new Date(expiryDate).getTime() - new Date(today).getTime()) / 86400000
    );
    let status: string = "valid";
    if (daysRemaining < 0) status = "expired";
    else if (daysRemaining <= 30) status = "expiring_soon";

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    let driverId: string | null = null;
    if (user) {
      const { data: d } = await supabase.from("drivers").select("id").eq("auth_user_id", user.id).single();
      driverId = d?.id ?? null;
    }

    const data = {
      vehicle_id: id,
      doc_type: docType,
      expiry_date: expiryDate,
      days_remaining: daysRemaining,
      status,
      document_url: docUrl,
      updated_by: driverId,
    };

    if (editDoc) {
      const { error: err } = await supabase
        .from("fleet_documents")
        .update({ ...data, alert_sent: false })
        .eq("id", editDoc.id);
      if (err) setDocError(err.message);
    } else {
      const { error: err } = await supabase
        .from("fleet_documents")
        .insert({ ...data, alert_sent: false });
      if (err) setDocError(err.message);
    }

    setDocSaving(false);
    if (!docError) {
      setDocDialogOpen(false);
      load();
    }
  }

  async function handleSaveMaint() {
    if (!serviceType) { setMaintError("Select service type"); return; }
    setMaintSaving(true);
    setMaintError("");

    const { data: { user } } = await supabase.auth.getUser();
    let driverId: string | null = null;
    if (user) {
      const { data: d } = await supabase.from("drivers").select("id").eq("auth_user_id", user.id).single();
      driverId = d?.id ?? null;
    }

    const { error: err } = await supabase.from("maintenance_logs").insert({
      vehicle_id: id,
      service_date: serviceDate,
      odometer: odometer ? parseInt(odometer) : null,
      service_type: serviceType,
      next_service_odo: nextServiceOdo ? parseInt(nextServiceOdo) : null,
      mechanic: mechanic || null,
      cost: cost ? parseFloat(cost) : null,
      notes: maintNotes || null,
      created_by: driverId,
    });

    if (err) {
      setMaintError(err.message);
    } else {
      setMaintDialogOpen(false);
      load();
    }
    setMaintSaving(false);
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!vehicle) return <div className="p-6 text-red-600">Vehicle not found.</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/fleet">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">
            {vehicle.plate_number}
          </h1>
          <p className="text-sm text-muted-foreground">
            {vehicle.type} | {vehicle.capacity_liters?.toLocaleString() ?? "—"}L | {vehicle.owner}
          </p>
        </div>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({maintenance.length})</TabsTrigger>
          <TabsTrigger value="checklists">Checklists ({checklists.length})</TabsTrigger>
        </TabsList>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-[#1A3A5C] hover:bg-[#15304D]"
              onClick={openAddDoc}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Document
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Document</th>
                  <th className="text-left p-3">Expiry</th>
                  <th className="text-right p-3">Days Left</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">File</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-6 text-muted-foreground">
                      No documents
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{doc.doc_type}</td>
                      <td className="p-3">
                        {doc.expiry_date
                          ? new Date(doc.expiry_date).toLocaleDateString("en-MY")
                          : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {doc.days_remaining ?? "—"}
                      </td>
                      <td className="p-3">
                        <Badge
                          className={docStatusColor(doc.status, doc.days_remaining)}
                          variant="secondary"
                        >
                          {doc.status === "expired"
                            ? "Expired"
                            : doc.status === "expiring_soon"
                              ? "Expiring"
                              : "Valid"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {doc.document_url ? (
                          <a
                            href={doc.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditDoc(doc)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Document Dialog */}
          <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editDoc ? "Edit Document" : "Add Document"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Document Type</label>
                  <Select value={docType} onValueChange={(v) => v && setDocType(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Expiry Date</label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Upload Document</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {editDoc?.document_url && (
                    <p className="text-xs text-muted-foreground">
                      Current:{" "}
                      <a href={editDoc.document_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        View existing
                      </a>
                    </p>
                  )}
                </div>
                {docError && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{docError}</p>
                )}
                <Button
                  onClick={handleSaveDoc}
                  className="w-full bg-[#1A3A5C] hover:bg-[#15304D]"
                  disabled={docSaving}
                >
                  {docSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-[#1A3A5C] hover:bg-[#15304D]"
              onClick={() => {
                setServiceDate(new Date().toISOString().split("T")[0]);
                setOdometer("");
                setServiceType("");
                setNextServiceOdo("");
                setMechanic("");
                setCost("");
                setMaintNotes("");
                setMaintError("");
                setMaintDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Log
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Service Type</th>
                  <th className="text-right p-3">ODO</th>
                  <th className="text-right p-3">Next Service ODO</th>
                  <th className="text-left p-3">Mechanic</th>
                  <th className="text-right p-3">Cost</th>
                  <th className="text-left p-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {maintenance.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-6 text-muted-foreground">
                      No maintenance logs
                    </td>
                  </tr>
                ) : (
                  maintenance.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 whitespace-nowrap">
                        {new Date(m.service_date).toLocaleDateString("en-MY")}
                      </td>
                      <td className="p-3">{m.service_type}</td>
                      <td className="p-3 text-right font-mono">
                        {m.odometer?.toLocaleString() ?? "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {m.next_service_odo?.toLocaleString() ?? "—"}
                      </td>
                      <td className="p-3">{m.mechanic || "—"}</td>
                      <td className="p-3 text-right">
                        {m.cost != null ? `RM ${m.cost.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-3 max-w-[200px] truncate">{m.notes || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Maintenance Dialog */}
          <Dialog open={maintDialogOpen} onOpenChange={setMaintDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Maintenance Log</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Service Type</label>
                    <Select value={serviceType} onValueChange={(v) => v && setServiceType(v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {SERVICE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">ODO Reading</label>
                    <Input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Next Service ODO</label>
                    <Input type="number" value={nextServiceOdo} onChange={(e) => setNextServiceOdo(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mechanic</label>
                    <Input value={mechanic} onChange={(e) => setMechanic(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cost (RM)</label>
                    <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    className="w-full border rounded-md p-2 text-sm min-h-[60px] resize-y"
                    value={maintNotes}
                    onChange={(e) => setMaintNotes(e.target.value)}
                  />
                </div>
                {maintError && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{maintError}</p>
                )}
                <Button
                  onClick={handleSaveMaint}
                  className="w-full bg-[#1A3A5C] hover:bg-[#15304D]"
                  disabled={maintSaving}
                >
                  {maintSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Checklists Tab */}
        <TabsContent value="checklists" className="mt-4">
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Driver</th>
                  <th className="text-right p-3">ODO</th>
                  <th className="text-left p-3">Defects?</th>
                  <th className="text-left p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {checklists.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center p-6 text-muted-foreground">
                      No checklists
                    </td>
                  </tr>
                ) : (
                  checklists.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 whitespace-nowrap">
                        {new Date(c.check_date).toLocaleDateString("en-MY")}
                      </td>
                      <td className="p-3">{c.driver?.name ?? "—"}</td>
                      <td className="p-3 text-right font-mono">
                        {c.odometer?.toLocaleString() ?? "—"}
                      </td>
                      <td className="p-3">
                        {c.has_defect ? (
                          <Badge variant="destructive">Yes</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800" variant="secondary">No</Badge>
                        )}
                      </td>
                      <td className="p-3 max-w-[300px]">
                        {c.defect_details || "—"}
                        {c.defect_photo_url && (
                          <a
                            href={c.defect_photo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-blue-600 hover:underline text-xs"
                          >
                            Photo
                          </a>
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
    </div>
  );
}
