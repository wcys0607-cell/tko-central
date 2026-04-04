"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Loader2,
  Package,
  ShoppingCart,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Fixed location IDs
const TANK_A_ID = "58bb745f-6ec2-44b6-bf8c-bc17b4da6ba0";
const TRAILER_ID = "01baf0ce-183d-4e9f-b6cf-6f34bc0faf25";

// Company name for purchase detection
const OWN_COMPANY = "TOP KIM OIL SDN. BHD.";

interface ImportableOrder {
  id: string;
  order_date: string;
  customer_name: string;
  customer_short_name: string | null;
  destination: string | null;
  load_from: string | null;
  quantity_liters: number | null;
  unit_price: number | null;
  dn_number: string | null;
  invoice_number: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  stock_type: "sale" | "purchase"; // auto-categorized
}

export default function ImportOrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { role } = useAuth();

  const today = new Date().toISOString().split("T")[0];
  const [orders, setOrders] = useState<ImportableOrder[]>([]);
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
        load_from,
        quantity_liters,
        unit_price,
        dn_number,
        invoice_number,
        customer:customer_id(name, short_name),
        driver:driver_id(name),
        vehicle:vehicle_id(plate_number)
      `)
      .eq("status", "delivered")
      .or("stock_sync_status.is.null,stock_sync_status.eq.pending")
      .or("load_from.ilike.%store%,destination.ilike.%store%")
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

    const mapped: ImportableOrder[] = (data ?? []).map((o: Record<string, unknown>) => {
      const cust = o.customer as { name: string; short_name?: string } | null;
      const drv = o.driver as { name: string } | null;
      const veh = o.vehicle as { plate_number: string } | null;
      const customerName = cust?.name ?? "";

      // Auto-categorize:
      // Purchase: customer is own company + destination is "Store" (buying diesel into stock)
      // Sale: load_from is "Store" (selling from own stock / Tank A)
      const loadFrom = (o.load_from as string | null) ?? "";
      const destination = (o.destination as string | null) ?? "";
      const isPurchase =
        customerName.toUpperCase().includes("TOP KIM") &&
        destination.toLowerCase().includes("store");
      const isSale = loadFrom.toLowerCase() === "store" && !isPurchase;

      return {
        id: o.id as string,
        order_date: o.order_date as string,
        customer_name: customerName,
        customer_short_name: cust?.short_name ?? null,
        destination: o.destination as string | null,
        load_from: o.load_from as string | null,
        quantity_liters: o.quantity_liters as number | null,
        unit_price: o.unit_price as number | null,
        dn_number: o.dn_number as string | null,
        invoice_number: o.invoice_number as string | null,
        driver_name: drv?.name ?? null,
        vehicle_plate: veh?.plate_number ?? null,
        stock_type: isPurchase ? "purchase" : isSale ? "sale" : "sale",
      };
    });

    setOrders(mapped);
    // Default: select all
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

    if (!confirm(`Import ${selected.size} order(s) to Stock Control?`)) return;

    setImporting(true);

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

    // Get current balances for Tank A and Trailer
    const { data: locs } = await supabase
      .from("stock_locations")
      .select("id, current_balance")
      .in("id", [TANK_A_ID, TRAILER_ID]);

    let tankABalance = locs?.find((l: { id: string; current_balance: number }) => l.id === TANK_A_ID)?.current_balance ?? 0;
    let trailerBalance = locs?.find((l: { id: string; current_balance: number }) => l.id === TRAILER_ID)?.current_balance ?? 0;

    const selectedOrders = orders.filter((o) => selected.has(o.id));
    let successCount = 0;
    let errorCount = 0;

    for (const order of selectedOrders) {
      const qty = Math.abs(order.quantity_liters ?? 0);
      if (qty === 0) {
        errorCount++;
        continue;
      }

      const isSale = order.stock_type === "sale";

      // Create stock transaction
      const { error: insertError } = await supabase
        .from("stock_transactions")
        .insert({
          transaction_date: new Date(`${order.order_date}T12:00:00`).toISOString(),
          type: isSale ? "sale" : "purchase",
          source_location_id: isSale ? TANK_A_ID : null,
          dest_location_id: isSale ? null : TRAILER_ID,
          quantity_liters: qty,
          price_per_liter: order.unit_price ?? null,
          owner: "Company",
          customer_name: order.customer_name || null,
          reference: order.dn_number || order.invoice_number || null,
          notes: `Imported from Order`,
          order_id: order.id,
          created_by: driverId,
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        errorCount++;
        continue;
      }

      // Update stock balance
      if (isSale) {
        tankABalance -= qty;
        await supabase
          .from("stock_locations")
          .update({ current_balance: tankABalance })
          .eq("id", TANK_A_ID);
      } else {
        trailerBalance += qty;
        await supabase
          .from("stock_locations")
          .update({ current_balance: trailerBalance })
          .eq("id", TRAILER_ID);
      }

      // Update order stock_sync_status
      await supabase
        .from("orders")
        .update({ stock_sync_status: "synced" })
        .eq("id", order.id);

      successCount++;
    }

    if (successCount > 0) {
      toast.success(`${successCount} order(s) imported to Stock Control`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} order(s) failed to import`);
    }

    setImporting(false);
    router.push("/stock/transactions");
  }

  const salesCount = orders.filter(
    (o) => selected.has(o.id) && o.stock_type === "sale"
  ).length;
  const purchaseCount = orders.filter(
    (o) => selected.has(o.id) && o.stock_type === "purchase"
  ).length;
  const totalSalesQty = orders
    .filter((o) => selected.has(o.id) && o.stock_type === "sale")
    .reduce((s, o) => s + (o.quantity_liters ?? 0), 0);
  const totalPurchaseQty = orders
    .filter((o) => selected.has(o.id) && o.stock_type === "purchase")
    .reduce((s, o) => s + (o.quantity_liters ?? 0), 0);

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
              Import Orders to Stock
            </h1>
            <p className="text-sm text-muted-foreground">
              Delivered orders pending stock sync
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
            Import {selected.size} Order{selected.size !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Summary */}
      {selected.size > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium">
                  Sales ({salesCount})
                </span>
              </div>
              <p className="text-lg font-bold text-destructive">
                -{totalSalesQty.toLocaleString()}L
              </p>
              <p className="text-xs text-muted-foreground">
                Deduct from Tank A
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-status-approved-fg" />
                <span className="text-sm font-medium">
                  Purchases ({purchaseCount})
                </span>
              </div>
              <p className="text-lg font-bold text-status-approved-fg">
                +{totalPurchaseQty.toLocaleString()}L
              </p>
              <p className="text-xs text-muted-foreground">Add to Trailer</p>
            </CardContent>
          </Card>
        </div>
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
            <p className="text-sm">
              No delivered orders pending stock import.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {orders.length} Order{orders.length !== 1 ? "s" : ""} Ready
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
                {selected.size === orders.length
                  ? "Deselect All"
                  : "Select All"}
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
                    <th className="p-3 text-left hidden md:table-cell">
                      Destination
                    </th>
                    <th className="p-3 text-right">Qty (L)</th>
                    <th className="p-3 text-left hidden lg:table-cell">
                      DN / Invoice
                    </th>
                    <th className="p-3 text-center">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const isSelected = selected.has(o.id);
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
                          {format(
                            new Date(o.order_date + "T00:00:00"),
                            "d MMM"
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-medium truncate max-w-[200px]">
                            {o.customer_short_name || o.customer_name}
                          </div>
                          {o.driver_name && (
                            <div className="text-xs text-muted-foreground">
                              {o.driver_name}
                              {o.vehicle_plate
                                ? ` · ${o.vehicle_plate}`
                                : ""}
                            </div>
                          )}
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <div className="truncate max-w-[200px] text-muted-foreground">
                            {o.destination ?? "—"}
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-medium">
                          {(o.quantity_liters ?? 0).toLocaleString()}
                        </td>
                        <td className="p-3 hidden lg:table-cell text-muted-foreground">
                          {o.dn_number || o.invoice_number || "—"}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={
                              o.stock_type === "purchase"
                                ? "default"
                                : "secondary"
                            }
                            className={`text-[10px] px-2 ${
                              o.stock_type === "purchase"
                                ? "bg-status-approved-fg/15 text-status-approved-fg border-status-approved-fg/30"
                                : "bg-destructive/10 text-destructive border-destructive/30"
                            }`}
                          >
                            {o.stock_type === "purchase"
                              ? "Purchase"
                              : "Sale"}
                          </Badge>
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
