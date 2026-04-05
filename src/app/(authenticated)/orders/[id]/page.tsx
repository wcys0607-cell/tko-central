"use client";

import { useEffect, useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Order, OrderItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowLeft, Download, ExternalLink, Lock, PackageCheck, Pencil, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Driver, Vehicle } from "@/lib/types";

const LOAD_FROM_OPTIONS = [
  "Caltex Pasir Gudang",
  "CYL",
  "Petron Pasir Gudang",
  "Petronas Melaka",
  "Petronas Pasir Gudang",
  "Store",
];

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value ?? "—"}</span>
    </div>
  );
}

function InlineNumberRow({
  label,
  value,
  field,
  step,
  prefix,
  suffix,
  onSave,
}: {
  label: string;
  value: number | null;
  field: string;
  step?: string;
  prefix?: string;
  suffix?: string;
  onSave: (field: string, value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");

  function handleBlur() {
    setEditing(false);
    const newVal = draft.trim() || null;
    const oldVal = value?.toString() ?? null;
    if (newVal !== oldVal) {
      onSave(field, newVal);
    }
  }

  if (!editing) {
    return (
      <div
        className="flex justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
        onClick={() => {
          setDraft(value?.toString() ?? "");
          setEditing(true);
        }}
      >
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">
          {value != null && value !== 0 ? `${prefix ?? ""}${value}${suffix ?? ""}` : "—"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={step ?? "0.01"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Enter") handleBlur(); }}
        className="h-7 w-[120px] text-sm text-right font-medium"
        autoFocus
      />
    </div>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { role, driverProfile } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Load drivers and vehicles for inline editing
  useEffect(() => {
    async function loadLookups() {
      const [d, v] = await Promise.all([
        supabase.from("drivers").select("id,name,role").eq("is_active", true).order("name"),
        supabase.from("vehicles").select("id,plate_number,type").eq("is_active", true).order("plate_number"),
      ]);
      setDrivers(((d.data as Driver[]) ?? []).filter((dr) => dr.role === "driver"));
      setVehicles(((v.data as Vehicle[]) ?? []).filter((vh) => vh.type === "Road Tanker"));
    }
    loadLookups();
  }, [supabase]);

  // Inline update helper
  const NUMERIC_FIELDS = ["wages", "transport", "special_allowance", "allowance_liters", "allowance_unit_price"];
  async function inlineUpdate(field: string, value: string | null) {
    if (!order) return;
    let dbValue: string | number | null = value;
    if (NUMERIC_FIELDS.includes(field)) {
      dbValue = value ? parseFloat(value) : null;
    }
    const { error } = await supabase.from("orders").update({ [field]: dbValue }).eq("id", order.id);
    if (error) {
      toast.error("Failed to update");
    } else {
      toast.success("Updated");
      fetchOrder();
    }
  }

  async function fetchOrder() {
    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select(`
          *,
          customer:customer_id(id,name,short_name),
          product:product_id(id,name,unit),
          driver:driver_id(id,name,phone),
          vehicle:vehicle_id(id,plate_number),
          creator:created_by(id,name),
          approver:approved_by(id,name)
        `)
        .eq("id", id)
        .single(),
      supabase
        .from("order_items")
        .select("*, product:product_id(id,name,unit)")
        .eq("order_id", id)
        .order("sort_order"),
    ]);
    setOrder(orderRes.data as Order);
    setOrderItems((itemsRes.data as OrderItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchOrder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function callOrderApi(action: "approve" | "reject" | "cancel" | "deliver", reason?: string) {
    if (!order) return;
    setActionLoading(true);
    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Action failed");
    } else if (action === "cancel" && data.has_bukku_so) {
      if (data.bukku_void?.ok) {
        toast.success(`Order cancelled. Voided in Bukku: ${data.bukku_void.voided.join(", ")}`);
      } else if (data.bukku_void?.error) {
        toast.error(`Order cancelled but Bukku void failed: ${data.bukku_void.error}`);
      } else {
        toast.success("Order cancelled.");
      }
    }
    if (action === "reject") setRejectDialogOpen(false);
    setRejectReason("");
    await fetchOrder();
    setActionLoading(false);
  }

  const handleApprove = () => callOrderApi("approve");
  const handleReject = () => callOrderApi("reject", rejectReason);
  const handleCancel = () => {
    const hasBukkuSO = !!order?.bukku_so_id;
    const msg = hasBukkuSO
      ? "Cancel this order? This will also void all linked documents (SO/DN/INV) in Bukku."
      : "Cancel this order?";
    if (confirm(msg)) callOrderApi("cancel");
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  if (role === "driver" || role === "guest") {
    router.replace("/driver");
    return <div className="p-6 text-muted-foreground">Redirecting...</div>;
  }

  if (!order) {
    return <div className="p-6 text-destructive">Order not found.</div>;
  }

  const customer = order.customer as { name: string; short_name?: string } | null;
  const product = order.product as { name: string; unit?: string } | null;
  const driver = order.driver as { name: string } | null;
  const vehicle = order.vehicle as { plate_number: string } | null;
  const creator = order.creator as { name: string } | null;
  const approver = order.approver as { name: string } | null;

  const isPurchase =
    (customer?.name ?? "").toUpperCase().includes("TOP KIM") &&
    (order.destination ?? "").toLowerCase().includes("store");
  const isStockLocked = order.stock_sync_status === "synced";
  const isWagesLocked = !!order.wages_finalized_at;
  const canEdit = (role === "admin" || role === "office" || role === "manager") && !isStockLocked;
  const canInlineEdit = (role === "admin" || role === "manager") && !isStockLocked;
  const canEditWages = canInlineEdit && !isWagesLocked;
  const canApprove = order.status === "pending" && (role === "admin" || role === "manager");
  const canReject = order.status === "pending" && (role === "admin" || role === "manager");
  const canDeliver = order.status === "approved" && (role === "admin" || role === "manager") && !isStockLocked;
  const canSendToDriver = role === "admin" || role === "manager" || role === "office";
  const canCancel = role === "admin" && order.status !== "cancelled" && !isStockLocked;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Order Detail</h1>
            <p className="text-sm text-muted-foreground">
              {order.order_date
                ? format(new Date(order.order_date + "T00:00:00"), "d MMMM yyyy")
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} type="order" />
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/orders/${order.id}/edit`)}
              className="gap-2"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {isStockLocked && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            This order has been imported to Stock Control. To make changes, cancel the stock import first.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Order Information</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Customer" value={customer?.name} />
            {order.order_type === "agent" && order.agent_name && (
              <InfoRow label="Agent" value={order.agent_name} />
            )}
            <InfoRow label="Destination" value={order.destination === "_custom" ? "—" : order.destination} />
            {canInlineEdit ? (
              <>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Load From</span>
                  <Select value={order.load_from ?? ""} onValueChange={(v) => inlineUpdate("load_from", v || null)}>
                    <SelectTrigger className="h-7 w-auto min-w-[140px] text-sm font-medium text-right">
                      <SelectValue>{order.load_from || "Select..."}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LOAD_FROM_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt} label={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Driver</span>
                  <Select value={order.driver_id ?? ""} onValueChange={(v) => inlineUpdate("driver_id", v || null)}>
                    <SelectTrigger className="h-7 w-auto min-w-[140px] text-sm font-medium text-right">
                      <SelectValue>
                        {order.driver_id ? (drivers.find((d) => d.id === order.driver_id)?.name ?? "—") : "Select..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={d.id} label={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Truck</span>
                  <Select value={order.vehicle_id ?? ""} onValueChange={(v) => inlineUpdate("vehicle_id", v || null)}>
                    <SelectTrigger className="h-7 w-auto min-w-[140px] text-sm font-medium text-right">
                      <SelectValue>
                        {order.vehicle_id ? (vehicles.find((vh) => vh.id === order.vehicle_id)?.plate_number ?? "—") : "Select..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id} label={v.plate_number}>{v.plate_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <InfoRow label="Load From" value={order.load_from} />
                <InfoRow label="Driver" value={driver?.name} />
                <InfoRow label="Truck" value={vehicle?.plate_number} />
              </>
            )}
            <InfoRow label="DN Number" value={order.dn_number} />
            <InfoRow label="DN Received" value={order.dn_received ? "Yes" : "No"} />
            <InfoRow label="Invoice Number" value={order.invoice_number} />
            {order.receipt_no && <InfoRow label="Receipt No" value={order.receipt_no} />}
            {order.remark && <InfoRow label="Remark (Internal)" value={order.remark} />}
            {order.delivery_remark && <InfoRow label="Remark for Delivery" value={order.delivery_remark} />}
          </CardContent>
        </Card>

        {/* Financials + Status */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
            <CardContent>
              {orderItems.length > 0 ? (
                <div className="space-y-2">
                  {orderItems.map((item, idx) => {
                    const prod = item.product as { name: string; unit?: string } | null;
                    return (
                      <div key={item.id || idx} className="p-2.5 border rounded-lg text-sm">
                        <div className="font-medium">{prod?.name ?? "—"}</div>
                        <div className="flex justify-between text-muted-foreground mt-1">
                          <span>{item.quantity_liters?.toLocaleString()} {prod?.unit ?? "L"} × RM {item.unit_price?.toFixed(4)}</span>
                          <span className="font-medium text-foreground">RM {item.line_total?.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                        </div>
                        {item.sst_amount > 0 && (
                          <div className="text-xs text-muted-foreground mt-0.5">SST ({item.sst_rate}%): RM {item.sst_amount?.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</div>
                        )}
                        {order.order_type === "agent" && item.cost_to_agent != null && item.unit_price != null && (
                          <div className="text-xs text-muted-foreground">
                            Cost to Agent: RM {item.cost_to_agent.toFixed(4)}/{prod?.unit ?? "L"}
                            {" · "}Commission: RM {((item.unit_price - item.cost_to_agent) * (item.quantity_liters ?? 0)).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="border-t pt-2 mt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Sale</span>
                      <span className="font-bold text-primary">
                        RM {(order.total_sale ?? orderItems.reduce((s, i) => s + (i.line_total ?? 0), 0)).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total SST</span>
                      <span>RM {(order.sst_amount ?? orderItems.reduce((s, i) => s + (i.sst_amount ?? 0), 0)).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span>Grand Total</span>
                      <span className="text-accent">
                        RM {((order.total_sale ?? 0) + (order.sst_amount ?? 0)).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Fallback: show legacy single-product fields */
                <div>
                  <InfoRow label="Product" value={product?.name} />
                  <InfoRow label="Quantity" value={order.quantity_liters ? `${order.quantity_liters.toLocaleString()} L` : null} />
                  <InfoRow label="Unit Price" value={order.unit_price ? `RM ${order.unit_price.toFixed(4)}` : null} />
                  {order.order_type === "agent" && <InfoRow label="Cost to Agent" value={order.cost_to_agent ? `RM ${order.cost_to_agent.toFixed(4)}` : null} />}
                  <InfoRow label="Total Sale" value={order.total_sale ? `RM ${order.total_sale.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : null} />
                  <InfoRow label="SST" value={order.sst_amount ? `RM ${order.sst_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : null} />
                </div>
              )}
              {/* Wages section */}
              {(() => {
                // Auto-calculate wages based on product type
                const productName = (product?.name ?? "").toUpperCase();
                const isService = productName.startsWith("TRANSPORTATION");
                const qty = order.quantity_liters ?? 0;
                const rate = isService ? (order.unit_price ?? 0) : (order.transport ?? 0);
                const calculatedWages = qty * rate * 0.22;
                const currentWages = order.wages ?? 0;
                const hasOverride = currentWages > 0 && Math.abs(currentWages - calculatedWages) > 0.01;

                return (
                  <>
                    {canEditWages ? (
                      <>
                        <InlineNumberRow label="Wages (RM)" value={order.wages} field="wages" step="0.01" prefix="RM " onSave={inlineUpdate} />
                        {calculatedWages > 0 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-1 -mt-1 mb-1">
                            <span>
                              Formula: {qty.toLocaleString()} × RM {rate.toFixed(4)} × 22% = RM {calculatedWages.toFixed(2)}
                              {isService ? " (service)" : " (product)"}
                            </span>
                            {(hasOverride || !order.wages) && (
                              <button
                                className="text-primary underline text-xs"
                                onClick={() => inlineUpdate("wages", calculatedWages.toFixed(2))}
                              >
                                {order.wages ? "Reset" : "Apply"}
                              </button>
                            )}
                          </div>
                        )}
                        <InlineNumberRow label="Allowance (LT)" value={order.allowance_liters} field="allowance_liters" step="1" suffix=" L" onSave={inlineUpdate} />
                        <InlineNumberRow label="Allowance (Unit Price)" value={order.allowance_unit_price} field="allowance_unit_price" step="0.01" prefix="RM " onSave={inlineUpdate} />
                        <InlineNumberRow label="Special Allowance (RM)" value={order.special_allowance} field="special_allowance" prefix="RM " onSave={inlineUpdate} />
                        <InlineNumberRow label="Transport (RM)" value={order.transport} field="transport" prefix="RM " onSave={inlineUpdate} />
                      </>
                    ) : (
                      <>
                        {!!order.wages && <InfoRow label="Wages" value={`RM ${order.wages.toFixed(2)}`} />}
                        {!!order.allowance_liters && <InfoRow label="Allowance (LT)" value={`${order.allowance_liters.toLocaleString()} L`} />}
                        {!!order.allowance_unit_price && !!order.allowance_liters && <InfoRow label="Allowance (Unit Price)" value={`RM ${order.allowance_unit_price.toFixed(2)}`} />}
                        {!!order.special_allowance && <InfoRow label="Special Allowance" value={`RM ${order.special_allowance}`} />}
                        {order.transport && <InfoRow label="Transport" value={`RM ${order.transport}`} />}
                      </>
                    )}
                    {isWagesLocked && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Wages finalised — fields locked
                      </p>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Sync Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!isPurchase && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Bukku</span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <StatusBadge status={order.bukku_sync_status ?? "pending"} type="order" />
                  {order.status !== "cancelled" && order.status !== "rejected" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={actionLoading}
                      onClick={async () => {
                        setActionLoading(true);
                        const res = await fetch("/api/bukku/push-invoice", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ orderId: order.id, pushType: "sales_order" }),
                        });
                        const json = await res.json();
                        if (json.ok) {
                          toast.success(order.bukku_so_id ? "Sales Order updated in Bukku" : "Sales Order pushed to Bukku");
                          fetchOrder();
                        } else {
                          toast.error(json.error || "Failed to push SO");
                        }
                        setActionLoading(false);
                      }}
                    >
                      {order.bukku_so_id ? "Update SO" : "Push SO"}
                    </Button>
                  )}
                </div>
              </div>
              )}
              {!isPurchase && order.bukku_so_id && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Bukku SO</span>
                    <span className="text-sm text-green-600 font-medium">{order.bukku_so_number ?? "Synced"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">SO Document</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => {
                          window.open(`/api/bukku/pdf?orderId=${order.id}`, "_blank");
                        }}
                      >
                        <Download className="h-3 w-3" />
                        PDF
                      </Button>
                      {order.bukku_short_link && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs gap-1"
                          onClick={() => {
                            window.open(order.bukku_short_link!, "_blank");
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Online
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
              {!isPurchase && order.bukku_do_number && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Bukku DN</span>
                  <span className="text-sm text-green-600 font-medium">{order.bukku_do_number}</span>
                </div>
              )}
              {!isPurchase && order.bukku_invoice_number && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Bukku Invoice</span>
                  <span className="text-sm text-green-600 font-medium">{order.bukku_invoice_number}</span>
                </div>
              )}
              {!isPurchase && order.bukku_payment_status && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Payment</span>
                  <StatusBadge status={order.bukku_payment_status ?? ""} type="order" />
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Stock</span>
                <StatusBadge status={order.stock_sync_status ?? "pending"} type="order" />
              </div>
              <div className="border-t pt-3 space-y-1 text-sm">
                <InfoRow label="Created by" value={creator?.name} />
                <InfoRow label="Acknowledged by" value={approver?.name} />
                <InfoRow
                  label="Created"
                  value={order.created_at ? format(new Date(order.created_at), "d MMM yyyy HH:mm") : null}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {canApprove && (
          <Button
            onClick={handleApprove}
            disabled={actionLoading}
            className="bg-status-approved-fg hover:bg-status-approved-fg/90"
          >
            Acknowledge
          </Button>
        )}
        {canDeliver && (
          <Button
            onClick={() => {
              if (confirm("Mark this order as delivered?")) callOrderApi("deliver");
            }}
            disabled={actionLoading}
            className="bg-status-delivered-bg text-status-delivered-fg hover:bg-status-delivered-bg/80 border border-status-delivered-fg/20 gap-2"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Mark as Delivered
          </Button>
        )}
        {canReject && (
          <Button
            variant="outline"
            onClick={() => setRejectDialogOpen(true)}
            disabled={actionLoading}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Reject Order
          </Button>
        )}
        {canSendToDriver && order.driver_id && (
          <Button
            variant="outline"
            className="gap-2"
            disabled={actionLoading}
            onClick={async () => {
              setActionLoading(true);
              const res = await fetch(`/api/orders/${order.id}/notify-driver`, { method: "POST" });
              const data = await res.json();
              if (res.ok) {
                toast.success("Delivery details sent to driver");
              } else {
                toast.error(data.error || "Failed to send");
              }
              setActionLoading(false);
            }}
          >
            <Send className="h-3.5 w-3.5" />
            Send to Driver
          </Button>
        )}
        {canCancel && order.status !== "cancelled" && (
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={actionLoading}
            className="border-border text-muted-foreground"
          >
            Cancel Order
          </Button>
        )}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A WhatsApp notification will be sent to the order creator.
            </p>
            <Textarea
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleReject}
              disabled={actionLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
