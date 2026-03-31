"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StockLocation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewTransactionPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const [txDate, setTxDate] = useState(today);
  const [txType, setTxType] = useState("purchase");
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [owner, setOwner] = useState("Company");
  const [customerName, setCustomerName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const loadLocations = useCallback(async () => {
    const { data } = await supabase
      .from("stock_locations")
      .select("*")
      .order("code");
    if (data) setLocations(data);
  }, [supabase]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const needsSource = txType === "sale" || txType === "transfer" || txType === "adjustment";
  const needsDest = txType === "purchase" || txType === "transfer";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Quantity must be a positive number");
      return;
    }

    if (needsSource && !sourceId) {
      setError("Please select a source location");
      return;
    }
    if (needsDest && !destId) {
      setError("Please select a destination location");
      return;
    }
    if (txType === "purchase" && !price) {
      setError("Price per liter is required for purchases");
      return;
    }

    setSaving(true);

    const priceVal = price ? parseFloat(price) : null;

    // Get current user for created_by
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

    // For adjustments, store quantity as negative if source (deduction)
    const adjustedQty =
      txType === "adjustment" && sourceId && !destId ? -qty : qty;

    const { error: insertError } = await supabase
      .from("stock_transactions")
      .insert({
        transaction_date: new Date(`${txDate}T12:00:00`).toISOString(),
        type: txType,
        source_location_id: needsSource ? sourceId || null : null,
        dest_location_id: needsDest
          ? destId || null
          : txType === "adjustment" && !sourceId
            ? destId || null
            : null,
        quantity_liters: Math.abs(adjustedQty),
        price_per_liter: priceVal,
        owner,
        customer_name: customerName || null,
        reference: reference || null,
        notes: notes || null,
        created_by: driverId,
      });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    // Update stock_locations balances
    if (sourceId && (txType === "sale" || txType === "transfer" || txType === "adjustment")) {
      const loc = locations.find((l) => l.id === sourceId);
      if (loc) {
        await supabase
          .from("stock_locations")
          .update({ current_balance: (loc.current_balance ?? 0) - qty })
          .eq("id", sourceId);
      }
    }

    if (
      destId &&
      (txType === "purchase" || txType === "transfer" || (txType === "adjustment" && !sourceId))
    ) {
      const loc = locations.find((l) => l.id === destId);
      if (loc) {
        await supabase
          .from("stock_locations")
          .update({ current_balance: (loc.current_balance ?? 0) + qty })
          .eq("id", destId);
      }
    }

    router.push("/stock/transactions");
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/stock/transactions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-[#1A3A5C]">
          New Stock Transaction
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={txType} onValueChange={(v) => v && setTxType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="sale">Sale</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {needsSource && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Source Location{" "}
                  {txType === "adjustment" && (
                    <span className="text-muted-foreground font-normal">
                      (for deduction)
                    </span>
                  )}
                </label>
                <Select value={sourceId} onValueChange={(v) => v && setSourceId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name || l.code} ({l.current_balance?.toLocaleString() ?? 0}L)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(needsDest || (txType === "adjustment" && !sourceId)) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Destination Location
                  {txType === "adjustment" && (
                    <span className="text-muted-foreground font-normal">
                      {" "}(for addition)
                    </span>
                  )}
                </label>
                <Select value={destId} onValueChange={(v) => v && setDestId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name || l.code} ({l.current_balance?.toLocaleString() ?? 0}L)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity (Liters)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Price per Liter{" "}
                  {txType === "purchase" && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <Input
                  type="number"
                  step="0.0001"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.0000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Customer Name</label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reference (Invoice/DN)</label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                className="w-full border rounded-md p-2 text-sm min-h-[80px] resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                type="submit"
                className="bg-[#1A3A5C] hover:bg-[#15304D]"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Transaction"}
              </Button>
              <Link href="/stock/transactions">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
