"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Vehicle, FleetDocument, MaintenanceLog } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { ArrowLeft, Truck, FileText, Wrench } from "lucide-react";

const DOC_TYPES = ["Road Tax", "Insurance", "Puspakom", "APAD", "Calibration"];

function docStatusBadge(status: string | null, days: number | null) {
  if (status === "expired" || (days != null && days < 0))
    return <Badge variant="destructive">Expired</Badge>;
  if (days != null && days <= 7)
    return <Badge variant="destructive">{days}d left</Badge>;
  if (status === "expiring_soon" || (days != null && days <= 30))
    return <Badge className="bg-status-pending-bg text-status-pending-fg" variant="secondary">{days}d left</Badge>;
  if (days != null)
    return <Badge className="bg-status-approved-bg text-status-approved-fg" variant="secondary">{days}d</Badge>;
  return <Badge variant="secondary">—</Badge>;
}

interface VehicleData {
  vehicle: Vehicle;
  documents: FleetDocument[];
  maintenance: MaintenanceLog[];
}

export default function DriverVehiclesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { driverProfile } = useAuth();
  const [vehicleData, setVehicleData] = useState<VehicleData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!driverProfile?.id) { setLoading(false); return; }

    // Get assigned vehicle IDs
    const { data: assignments } = await supabase
      .from("driver_vehicle_assignments")
      .select("vehicle_id")
      .eq("driver_id", driverProfile.id);

    const vehicleIds = (assignments ?? []).map((a: { vehicle_id: string }) => a.vehicle_id);
    if (vehicleIds.length === 0) { setLoading(false); return; }

    // Fetch vehicles, documents, and recent maintenance for all assigned vehicles
    const [vRes, docRes, maintRes] = await Promise.all([
      supabase.from("vehicles").select("*").in("id", vehicleIds).order("plate_number"),
      supabase.from("fleet_documents").select("*").in("vehicle_id", vehicleIds).order("doc_type"),
      supabase
        .from("maintenance_logs")
        .select("*")
        .in("vehicle_id", vehicleIds)
        .order("service_date", { ascending: false })
        .limit(50),
    ]);

    const vehicles = vRes.data ?? [];
    const docs = docRes.data ?? [];
    const maint = maintRes.data ?? [];

    setVehicleData(
      vehicles.map((v: Vehicle) => ({
        vehicle: v,
        documents: docs.filter((d: FleetDocument) => d.vehicle_id === v.id),
        maintenance: maint.filter((m: MaintenanceLog) => m.vehicle_id === v.id),
      }))
    );
    setLoading(false);
  }, [supabase, driverProfile]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/driver">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-primary">My Vehicles</h1>
      </div>

      {vehicleData.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No vehicles assigned to you yet.</p>
            <p className="text-xs mt-1">Contact your manager to get vehicles assigned.</p>
          </CardContent>
        </Card>
      ) : (
        vehicleData.map(({ vehicle, documents, maintenance }) => {
          // Count expiring/expired docs
          const urgent = documents.filter((d) => (d.days_remaining ?? 999) <= 30).length;

          return (
            <Card key={vehicle.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Truck className="w-5 h-5 text-primary" />
                      {vehicle.plate_number}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {vehicle.type} | {vehicle.capacity_liters?.toLocaleString() ?? "—"}L
                    </p>
                  </div>
                  {urgent > 0 && (
                    <Badge variant="destructive">{urgent} expiring</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="docs">
                  <TabsList className="h-8">
                    <TabsTrigger value="docs" className="text-xs gap-1">
                      <FileText className="w-3 h-3" /> Documents
                    </TabsTrigger>
                    <TabsTrigger value="maint" className="text-xs gap-1">
                      <Wrench className="w-3 h-3" /> Maintenance
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="docs" className="mt-3">
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs">Document</th>
                            <th className="text-left px-3 py-2 text-xs">Expiry</th>
                            <th className="text-center px-3 py-2 text-xs">Status</th>
                            <th className="text-left px-3 py-2 text-xs">File</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DOC_TYPES.map((dt) => {
                            const doc = documents
                              .filter((d) => d.doc_type === dt)
                              .sort((a, b) => (b.expiry_date ?? "").localeCompare(a.expiry_date ?? ""))[0];
                            return (
                              <tr key={dt} className="border-b">
                                <td className="px-3 py-2 text-xs font-medium">{dt}</td>
                                <td className="px-3 py-2 text-xs">
                                  {doc?.expiry_date
                                    ? new Date(doc.expiry_date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {doc ? docStatusBadge(doc.status, doc.days_remaining) : <span className="text-muted-foreground text-xs">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {doc?.document_url ? (
                                    <a
                                      href={doc.document_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline text-xs"
                                    >
                                      View
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  <TabsContent value="maint" className="mt-3">
                    {maintenance.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No maintenance logs</p>
                    ) : (
                      <div className="border rounded-lg overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted border-b">
                            <tr>
                              <th className="text-left px-3 py-2 text-xs">Date</th>
                              <th className="text-left px-3 py-2 text-xs">Service</th>
                              <th className="text-right px-3 py-2 text-xs">ODO</th>
                              <th className="text-right px-3 py-2 text-xs">Next ODO</th>
                              <th className="text-left px-3 py-2 text-xs">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {maintenance.slice(0, 10).map((m) => (
                              <tr key={m.id} className="border-b">
                                <td className="px-3 py-2 text-xs whitespace-nowrap">
                                  {new Date(m.service_date).toLocaleDateString("en-MY")}
                                </td>
                                <td className="px-3 py-2 text-xs">{m.service_type}</td>
                                <td className="px-3 py-2 text-xs text-right font-mono">
                                  {m.odometer?.toLocaleString() ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-xs text-right font-mono">
                                  {m.next_service_odo?.toLocaleString() ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-xs max-w-[150px] truncate">
                                  {m.notes || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
