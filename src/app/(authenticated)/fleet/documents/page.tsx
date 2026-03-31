"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle, FleetDocument } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const DOC_TYPES = ["Road Tax", "Insurance", "Puspakom", "SPAD Permit", "Grant"];

function cellColor(doc: FleetDocument | undefined): string {
  if (!doc) return "";
  const days = doc.days_remaining ?? 999;
  if (days < 0) return "bg-red-100";
  if (days <= 7) return "bg-red-50";
  if (days <= 30) return "bg-yellow-50";
  return "bg-green-50";
}

function cellEmoji(doc: FleetDocument | undefined): string {
  if (!doc) return "—";
  const days = doc.days_remaining ?? 999;
  if (days < 0) return "🔴";
  if (days <= 7) return "🔴";
  if (days <= 30) return "🟡";
  return "🟢";
}

export default function DocumentTrackerPage() {
  const supabase = useMemo(() => createClient(), []);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<FleetDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);

  const load = useCallback(async () => {
    const [vRes, dRes] = await Promise.all([
      supabase.from("vehicles").select("*").eq("is_active", true).order("plate_number"),
      supabase.from("fleet_documents").select("*"),
    ]);
    if (vRes.data) setVehicles(vRes.data);
    if (dRes.data) setDocuments(dRes.data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Build lookup: vehicleId -> docType -> document
  const docMap = new Map<string, Map<string, FleetDocument>>();
  for (const doc of documents) {
    if (!docMap.has(doc.vehicle_id)) docMap.set(doc.vehicle_id, new Map());
    docMap.get(doc.vehicle_id)!.set(doc.doc_type, doc);
  }

  const filteredVehicles = showExpiringOnly
    ? vehicles.filter((v) => {
        const vDocs = docMap.get(v.id);
        if (!vDocs) return false;
        return Array.from(vDocs.values()).some(
          (d) => (d.days_remaining ?? 999) <= 30
        );
      })
    : vehicles;

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link href="/fleet">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Document Tracker</h1>
        </div>
        <Button
          variant={showExpiringOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowExpiringOnly(!showExpiringOnly)}
          className={showExpiringOnly ? "bg-red-600 hover:bg-red-700" : ""}
        >
          {showExpiringOnly ? "Showing Expiring Only" : "Show Expiring Only"}
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3 sticky left-0 bg-gray-50 z-10">Vehicle</th>
              {DOC_TYPES.map((dt) => (
                <th key={dt} className="text-center p-3 min-w-[130px]">{dt}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={DOC_TYPES.length + 1} className="text-center p-6 text-muted-foreground">
                  {showExpiringOnly ? "No expiring documents" : "No vehicles"}
                </td>
              </tr>
            ) : (
              filteredVehicles.map((v) => {
                const vDocs = docMap.get(v.id);
                return (
                  <tr key={v.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-semibold sticky left-0 bg-white z-10">
                      <Link href={`/fleet/${v.id}`} className="text-[#1A3A5C] hover:underline">
                        {v.plate_number}
                      </Link>
                    </td>
                    {DOC_TYPES.map((dt) => {
                      const doc = vDocs?.get(dt);
                      return (
                        <td key={dt} className={`p-3 text-center ${cellColor(doc)}`}>
                          {doc ? (
                            <Link
                              href={`/fleet/${v.id}`}
                              className="block hover:opacity-80"
                            >
                              <span className="text-lg">{cellEmoji(doc)}</span>
                              <br />
                              <span className="text-xs">
                                {doc.expiry_date
                                  ? new Date(doc.expiry_date).toLocaleDateString("en-MY", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "—"}
                              </span>
                              {doc.days_remaining != null && (
                                <>
                                  <br />
                                  <span className="text-[10px] text-muted-foreground">
                                    {doc.days_remaining < 0
                                      ? `${Math.abs(doc.days_remaining)}d overdue`
                                      : `${doc.days_remaining}d left`}
                                  </span>
                                </>
                              )}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>🟢 &gt;30 days</span>
        <span>🟡 7-30 days</span>
        <span>🔴 &lt;7 days or expired</span>
      </div>
    </div>
  );
}
