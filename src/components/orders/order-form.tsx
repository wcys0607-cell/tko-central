"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Customer, Product, Driver, Vehicle, Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LOAD_FROM_STATIC = [
  "Store",
  "Caltex Pasir Gudang",
  "Petronas",
  "Petron",
];

interface OrderFormProps {
  existingOrder?: Order;
}

export default function OrderForm({ existingOrder }: OrderFormProps) {
  const supabase = createClient();
  const router = useRouter();
  const { driverProfile } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    order_date: existingOrder?.order_date ?? today,
    customer_id: existingOrder?.customer_id ?? "",
    destination: existingOrder?.destination ?? "",
    product_id: existingOrder?.product_id ?? "",
    quantity_liters: existingOrder?.quantity_liters?.toString() ?? "",
    unit_price: existingOrder?.unit_price?.toString() ?? "",
    cost_price: existingOrder?.cost_price?.toString() ?? "",
    load_from: existingOrder?.load_from ?? "",
    driver_id: existingOrder?.driver_id ?? "",
    vehicle_id: existingOrder?.vehicle_id ?? "",
    dn_number: existingOrder?.dn_number ?? "",
    invoice_number: existingOrder?.invoice_number ?? "",
    order_type: existingOrder?.order_type ?? "own",
    middle_man_id: existingOrder?.middle_man_id ?? "",
    commission_rate: existingOrder?.commission_rate?.toString() ?? "",
    remark: existingOrder?.remark ?? "",
    wages: existingOrder?.wages?.toString() ?? "",
    allowance: existingOrder?.allowance?.toString() ?? "",
    transport: existingOrder?.transport?.toString() ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDropdowns() {
      const [c, p, d, v] = await Promise.all([
        supabase.from("customers").select("id,name,short_name").eq("is_active", true).order("name"),
        supabase.from("products").select("id,name,unit,default_price,sst_rate").eq("is_active", true).order("name"),
        supabase.from("drivers").select("id,name,role").eq("is_active", true).order("name"),
        supabase.from("vehicles").select("id,plate_number,type").eq("is_active", true).order("plate_number"),
      ]);
      setCustomers((c.data as Customer[]) ?? []);
      setProducts((p.data as Product[]) ?? []);
      setDrivers((d.data as Driver[]) ?? []);
      setVehicles((v.data as Vehicle[]) ?? []);
    }
    loadDropdowns();
  }, [supabase]);

  // Auto-fill unit price when product changes
  function handleProductChange(productId: string) {
    const product = products.find((p) => p.id === productId);
    setForm((prev) => ({
      ...prev,
      product_id: productId,
      unit_price: product?.default_price?.toString() ?? prev.unit_price,
    }));
  }

  // Computed totals
  const qty = parseFloat(form.quantity_liters) || 0;
  const unitPrice = parseFloat(form.unit_price) || 0;
  const product = products.find((p) => p.id === form.product_id);
  const sstRate = product?.sst_rate ?? 6;
  const totalSale = qty * unitPrice;
  const sstAmount = totalSale * (sstRate / 100);

  // Load-from options: static + vehicle plates
  const loadFromOptions = [
    ...LOAD_FROM_STATIC,
    ...vehicles.map((v) => {
      const d = drivers.find((dr) => dr.assigned_vehicle_id === v.id);
      return d ? `${v.plate_number} - ${d.name}` : v.plate_number;
    }),
  ];

  async function handleSave() {
    if (!form.customer_id) { setError("Customer is required."); return; }
    if (!form.order_date) { setError("Order date is required."); return; }
    setSaving(true);
    setError("");

    const payload = {
      order_date: form.order_date,
      customer_id: form.customer_id,
      destination: form.destination.trim() || null,
      product_id: form.product_id || null,
      quantity_liters: form.quantity_liters ? parseFloat(form.quantity_liters) : null,
      unit_price: form.unit_price ? parseFloat(form.unit_price) : null,
      cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
      total_sale: qty > 0 && unitPrice > 0 ? totalSale : null,
      sst_amount: qty > 0 && unitPrice > 0 ? sstAmount : null,
      load_from: form.load_from || null,
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      dn_number: form.dn_number.trim() || null,
      invoice_number: form.invoice_number.trim() || null,
      order_type: form.order_type as "own" | "agent",
      middle_man_id: form.order_type === "agent" && form.middle_man_id ? form.middle_man_id : null,
      commission_rate: form.commission_rate ? parseFloat(form.commission_rate) : null,
      remark: form.remark.trim() || null,
      wages: form.wages ? parseFloat(form.wages) : null,
      allowance: form.allowance ? parseFloat(form.allowance) : null,
      transport: form.transport ? parseFloat(form.transport) : null,
      // Only reset bukku status for new orders; edits keep current status
      ...(existingOrder ? {} : { bukku_sync_status: "pending" as const }),
      updated_at: new Date().toISOString(),
    };

    let orderId = existingOrder?.id;
    let err;

    if (existingOrder) {
      ({ error: err } = await supabase.from("orders").update(payload).eq("id", existingOrder.id));
    } else {
      const { data, error: insertErr } = await supabase
        .from("orders")
        .insert({ ...payload, status: "pending", stock_sync_status: "pending", created_by: driverProfile?.id ?? null })
        .select("id")
        .single();
      err = insertErr;
      orderId = data?.id;
    }

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    // Send WhatsApp notifications for new orders via API route
    if (!existingOrder && orderId) {
      fetch(`/api/orders/${orderId}`, { method: "POST" }).catch(() => {});
    }

    router.push(orderId ? `/orders/${orderId}` : "/orders");
  }

  const agentCustomers = customers.filter((c) => c.is_active);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-[#1A3A5C]">
          {existingOrder ? "Edit Order" : "New Order"}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Order Date *</label>
                  <Input
                    type="date"
                    value={form.order_date}
                    onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Order Type</label>
                  <Select
                    value={form.order_type}
                    onValueChange={(v) => v && setForm({ ...form, order_type: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="own">Own</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Customer *</label>
                <Select
                  value={form.customer_id || "_none"}
                  onValueChange={(v) => v && v !== "_none" && setForm({ ...form, customer_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Destination</label>
                <Input
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                  placeholder="Delivery address / site name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Product</label>
                  <Select
                    value={form.product_id || "_none"}
                    onValueChange={(v) => v && v !== "_none" && handleProductChange(v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Load From</label>
                  <Select
                    value={form.load_from || "_none"}
                    onValueChange={(v) => v && setForm({ ...form, load_from: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
                    <SelectContent>
                      {loadFromOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Quantity (L)</label>
                  <Input
                    type="number"
                    value={form.quantity_liters}
                    onChange={(e) => setForm({ ...form, quantity_liters: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Unit Price (RM)</label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={form.unit_price}
                    onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                    placeholder="0.0000"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Cost Price (RM)</label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    placeholder="0.0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Driver</label>
                  <Select
                    value={form.driver_id || "_none"}
                    onValueChange={(v) => v && setForm({ ...form, driver_id: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select driver..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {drivers.filter((d) => d.role === "driver").map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Truck</label>
                  <Select
                    value={form.vehicle_id || "_none"}
                    onValueChange={(v) => v && setForm({ ...form, vehicle_id: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select truck..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.plate_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">DN Number</label>
                  <Input
                    value={form.dn_number}
                    onChange={(e) => setForm({ ...form, dn_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Invoice Number</label>
                  <Input
                    value={form.invoice_number}
                    onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                  />
                </div>
              </div>

              {form.order_type === "agent" && (
                <div className="grid grid-cols-2 gap-4 p-3 bg-amber-50 rounded-md border border-amber-200">
                  <div>
                    <label className="text-sm font-medium">Middle Man / Agent</label>
                    <Select
                      value={form.middle_man_id || "_none"}
                      onValueChange={(v) => v && setForm({ ...form, middle_man_id: v === "_none" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {agentCustomers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Commission (per L)</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={form.commission_rate}
                      onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                      placeholder="0.0000"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Remark</label>
                <Textarea
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Wages (RM)</label>
                  <Input
                    type="number"
                    value={form.wages}
                    onChange={(e) => setForm({ ...form, wages: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Allowance (RM)</label>
                  <Input
                    type="number"
                    value={form.allowance}
                    onChange={(e) => setForm({ ...form, allowance: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Transport (RM)</label>
                  <Input
                    type="number"
                    value={form.transport}
                    onChange={(e) => setForm({ ...form, transport: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity</span>
                <span className="font-medium">{qty ? qty.toLocaleString() + " L" : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit Price</span>
                <span className="font-medium">{unitPrice ? `RM ${unitPrice.toFixed(4)}` : "—"}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="text-muted-foreground">Total Sale</span>
                <span className="font-bold text-[#1A3A5C]">
                  {totalSale ? `RM ${totalSale.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SST ({sstRate}%)</span>
                <span>
                  {sstAmount ? `RM ${sstAmount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "—"}
                </span>
              </div>
              <div className="flex justify-between font-bold border-t pt-3">
                <span>Grand Total</span>
                <span className="text-[#E8A020]">
                  {totalSale + sstAmount
                    ? `RM ${(totalSale + sstAmount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs mb-3">
                Status: {existingOrder?.status ?? "pending"}
              </Badge>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{error}</p>
              )}
              <div className="space-y-2">
                <Button
                  className="w-full bg-[#1A3A5C] hover:bg-[#15304D]"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : existingOrder ? "Save Changes" : "Create Order"}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
