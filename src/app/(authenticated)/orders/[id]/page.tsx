"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  delivered: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const BUKKU_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  synced: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
};

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value ?? "—"}</span>
    </div>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const router = useRouter();
  const { role, driverProfile } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function fetchOrder() {
    const { data } = await supabase
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
      .single();
    setOrder(data as Order);
    setLoading(false);
  }

  useEffect(() => {
    fetchOrder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function callOrderApi(action: "approve" | "reject" | "cancel", reason?: string) {
    if (!order) return;
    setActionLoading(true);
    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Action failed");
    }
    if (action === "reject") setRejectDialogOpen(false);
    setRejectReason("");
    await fetchOrder();
    setActionLoading(false);
  }

  const handleApprove = () => callOrderApi("approve");
  const handleReject = () => callOrderApi("reject", rejectReason);
  const handleCancel = () => callOrderApi("cancel");

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  if (!order) {
    return <div className="p-6 text-red-600">Order not found.</div>;
  }

  const customer = order.customer as { name: string; short_name?: string } | null;
  const product = order.product as { name: string; unit?: string } | null;
  const driver = order.driver as { name: string } | null;
  const vehicle = order.vehicle as { plate_number: string } | null;
  const creator = order.creator as { name: string } | null;
  const approver = order.approver as { name: string } | null;

  const canEdit = order.status === "pending" && (role === "admin" || role === "office" || role === "manager");
  const canApprove = order.status === "pending" && (role === "admin" || role === "manager");
  const canReject = order.status === "pending" && (role === "admin" || role === "manager");
  const canCancel = role === "admin" && order.status !== "cancelled";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[#1A3A5C]">Order Detail</h1>
            <p className="text-sm text-muted-foreground">
              {order.order_date
                ? format(new Date(order.order_date + "T00:00:00"), "d MMMM yyyy")
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`${STATUS_COLORS[order.status]} text-sm px-3 py-1`}>
            {order.status.toUpperCase()}
          </Badge>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Order Information</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Customer" value={customer?.name} />
            <InfoRow label="Destination" value={order.destination} />
            <InfoRow label="Product" value={product?.name} />
            <InfoRow label="Load From" value={order.load_from} />
            <InfoRow label="Driver" value={driver?.name} />
            <InfoRow label="Truck" value={vehicle?.plate_number} />
            <InfoRow label="DN Number" value={order.dn_number} />
            <InfoRow label="Invoice Number" value={order.invoice_number} />
            <InfoRow label="Order Type" value={order.order_type} />
            {order.remark && <InfoRow label="Remark" value={order.remark} />}
          </CardContent>
        </Card>

        {/* Financials + Status */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Financials</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Quantity" value={order.quantity_liters ? `${order.quantity_liters.toLocaleString()} L` : null} />
              <InfoRow label="Unit Price" value={order.unit_price ? `RM ${order.unit_price.toFixed(4)}` : null} />
              <InfoRow label="Cost Price" value={order.cost_price ? `RM ${order.cost_price.toFixed(4)}` : null} />
              <InfoRow
                label="Total Sale"
                value={order.total_sale
                  ? `RM ${order.total_sale.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
                  : null}
              />
              <InfoRow
                label="SST"
                value={order.sst_amount
                  ? `RM ${order.sst_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
                  : null}
              />
              {order.wages && <InfoRow label="Wages" value={`RM ${order.wages}`} />}
              {order.allowance && <InfoRow label="Allowance" value={`RM ${order.allowance}`} />}
              {order.transport && <InfoRow label="Transport" value={`RM ${order.transport}`} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Sync Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Bukku</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={BUKKU_COLORS[order.bukku_sync_status ?? "pending"] ?? ""}>
                    {order.bukku_sync_status ?? "pending"}
                  </Badge>
                  {(order.status === "approved" || order.status === "delivered") &&
                    !order.bukku_invoice_id &&
                    order.bukku_sync_status !== "synced" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={async () => {
                          const res = await fetch("/api/bukku/push-invoice", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ orderId: order.id }),
                          });
                          const json = await res.json();
                          if (json.ok) {
                            fetchOrder();
                          } else {
                            alert(json.error || "Failed to push invoice");
                          }
                        }}
                      >
                        Push to Bukku
                      </Button>
                    )}
                </div>
              </div>
              {order.bukku_payment_status && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Payment</span>
                  <Badge
                    variant="secondary"
                    className={
                      order.bukku_payment_status === "paid"
                        ? "bg-green-100 text-green-700"
                        : order.bukku_payment_status === "partial"
                        ? "bg-yellow-100 text-yellow-700"
                        : order.bukku_payment_status === "overdue"
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-700"
                    }
                  >
                    {order.bukku_payment_status}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Stock</span>
                <Badge
                  variant="secondary"
                  className={
                    order.stock_sync_status === "synced"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }
                >
                  {order.stock_sync_status ?? "pending"}
                </Badge>
              </div>
              <div className="border-t pt-3 space-y-1 text-sm">
                <InfoRow label="Created by" value={creator?.name} />
                <InfoRow label="Approved by" value={approver?.name} />
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
      {(canApprove || canReject || canCancel) && (
        <div className="flex gap-3 flex-wrap">
          {canApprove && (
            <Button
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              Approve Order
            </Button>
          )}
          {canReject && (
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(true)}
              disabled={actionLoading}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              Reject Order
            </Button>
          )}
          {canCancel && order.status !== "cancelled" && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={actionLoading}
              className="border-gray-300 text-gray-600"
            >
              Cancel Order
            </Button>
          )}
        </div>
      )}

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
              className="bg-red-600 hover:bg-red-700"
            >
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
