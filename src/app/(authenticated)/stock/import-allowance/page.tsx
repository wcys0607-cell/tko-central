"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Droplets,
  Loader2,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Fixed location ID
const TANK_A_ID = "58bb745f-6ec2-44b6-bf8c-bc17b4da6ba0";

interface AllowanceOrder {
  id: string;
  order_date: string;
  customer_name: string;
  customer_short_name: string | null;
  destination: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  allowance_liters: number;
  allowance_unit_price: number;
}

export default function ImportAllowancePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { role } = useAuth();

  const today = new Date().toISOString().split("T")[0];
  const [orders, setOrders] = useState<AllowanceOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [dateFilter, setDateFilter] = useState(today);

  const canImport = role === "admin" || role === "manager";

  const loadOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select(`
        id,
        order_date,
        destination,
        allowance_liters,
        allowance_unit_price,
        customer:customer_id(name, short_name),
        driver:driver_id(name),
        vehicle:vehicle_id(plate_number)
      `)
      .in("status", ["approved", "delivered"])
      .gt("allowance_liters", 0)
      .is("allowance_stock_synced", null)
      .order("order_date", { ascending: false });

    if (dateFilter) {
      query = query.eq("order_date", dateFilter);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Failed to load orders");
      setLoading(false);
      return;
    }

    const mapped: AllowanceOrder[] = (data ?? []).map((o: Record<string, unknown>) => {
      const cust = o.customer as { name: string; short_name?: string } | null;
      const drv = o.driver as { name: string } | null;
      const veh = o.vehicle as { plate_number: string } | null;

      return {
        id: o.id as string,
        order_date: o.order_date as string,
        customer_name: cust?.name ?? "",
        customer_short_name: cust?.short_name ?? null,
        destination: o.destination as string | null,
        driver_name: drv?.name ?? null,
        vehicle_plate: veh?.plate_number ?? null,
        allowance_liters: (o.allowance_liters as number) ?? 0,
        allowance_unit_price: (o.allowance_unit_price as number) ?? 0.5,
      };
    });

    setOrders(mapped);
    setSelected(new Set(mapped.map((o) => o.id)));
    setLoading(false);
  }, [supabase, dateFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  }

  async function handleImport() {
    if (selected.size === 0) {
      toast.error("No orders selected");
      return;
    }

    if (!confirm(`Import allowance from ${selected.size} order(s) to Stock Control?`)) return;

    setImporting(true);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    let driverId: string | null = null;
    if (user) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      driverId = driver?.id ?? null;
    }

    // Get current Tank A balance
    const { data: loc } = await supabase
      .from("stock_locations")
      .select("current_balance")
      .eq("id", TANK_A_ID)
      .single();

    let tankABalance = loc?.current_balance ?? 0;

    const selectedOrders = orders.filter((o) => selected.has(o.id));
    let successCount = 0;
    let errorCount = 0;

    for (const order of selectedOrders) {
      const qty = Math.abs(order.allowance_liters);
      if (qty === 0) {
        errorCount++;
        continue;
      }

      // Create stock transaction: Purchase, Partner, to Tank A
      const { error: insertError } = await supabase
        .from("stock_transactions")
        .insert({
          transaction_date: new Date(`${order.order_date}T12:00:00`).toISOString(),
          type: "purchase",
          source_location_id: null,
          dest_location_id: TANK_A_ID,
          quantity_liters: qty,
          price_per_liter: order.allowance_unit_price,
          owner: "Partner",
          customer_name: order.driver_name || null,
          reference: null,
          notes: `Allowance from Order`,
          order_id: order.id,
          created_by: driverId,
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        errorCount++;
        continue;
      }

      // Update Tank A balance
      tankABalance += qty;
      await supabase
        .from("stock_locations")
        .update({ current_balance: tankABalance })
        .eq("id", TANK_A_ID);

      // Mark allowance as synced on the order
      await supabase
        .from("orders")
        .update({ allowance_stock_synced: true })
        .eq("id", order.id);

      successCount++;
    }

    if (successCount > 0) {
      toast.success(`${successCount} allowance(s) imported to Stock Control`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} failed to import`);
    }

    setImporting(false);
    router.push("/stock/transactions");
  }

  const selectedOrders = orders.filter((o) => selected.has(o.id));
  const totalLiters = selectedOrders.reduce((s, o) => s + o.allowance_liters, 0);
  const totalValue = selectedOrders.reduce(
    (s, o) => s + o.allowance_liters * o.allowance_unit_price,
    0
  );

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link href="/stock">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-primary">
              Import Allowance to Stock
            </h1>
            <p className="text-sm text-muted-foreground">
              Partner purchase — adds to Tank A
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-[150px] h-9"
          />
          {dateFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setDateFilter("")}
            >
              All Dates
            </Button>
          )}
        </div>
      </div>

      {/* Import button */}
      <div className="flex justify-end">
        {canImport && selected.size > 0 && (
          <Button
            onClick={handleImport}
            disabled={importing}
            className="bg-primary hover:bg-primary/90 gap-2"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Import {selected.size} Allowance{selected.size !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Summary */}
      {selected.size > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Droplets className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">
                Partner Purchase ({selected.size})
              </span>
            </div>
            <p className="text-lg font-bold text-blue-600">
              +{totalLiters.toLocaleString()}L
            </p>
            <p className="text-xs text-muted-foreground">
              Add to Tank A — RM {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Check className="w-8 h-8 mx-auto mb-2 text-status-approved-fg" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm">No orders with allowance pending import.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {orders.length} Order{orders.length !== 1 ? "s" : ""} with Allowance
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1.5"
                onClick={toggleAll}
              >
                {selected.size === orders.length ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {selected.size === orders.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left w-10"></th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Party</th>
                    <th className="p-3 text-left hidden md:table-cell">Destination</th>
                    <th className="p-3 text-right">Allowance (L)</th>
                    <th className="p-3 text-right">Price/L</th>
                    <th className="p-3 text-right hidden md:table-cell">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const isSelected = selected.has(o.id);
                    const value = o.allowance_liters * o.allowance_unit_price;
                    return (
                      <tr
                        key={o.id}
                        className={`border-b cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/5"
                            : "hover:bg-muted/30 opacity-50"
                        }`}
                        onClick={() => toggleSelect(o.id)}
                      >
                        <td className="p-3">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {format(new Date(o.order_date + "T00:00:00"), "d MMM")}
                        </td>
                        <td className="p-3">
                          <div className="font-medium truncate max-w-[200px]">
                            {o.driver_name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {o.customer_short_name || o.customer_name}
                            {o.vehicle_plate ? ` · ${o.vehicle_plate}` : ""}
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <div className="truncate max-w-[200px] text-muted-foreground">
                            {o.destination ?? "—"}
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-medium">
                          {o.allowance_liters.toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono">
                          RM {o.allowance_unit_price.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono hidden md:table-cell">
                          RM {value.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
