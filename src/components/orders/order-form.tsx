"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Customer, Product, Driver, Vehicle, Order, Agent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Fuel, Truck, Package } from "lucide-react";
import { toast } from "sonner";

const LOAD_FROM_OPTIONS = [
  "Caltex Pasir Gudang",
  "CYL",
  "Petron Pasir Gudang",
  "Petronas Melaka",
  "Petronas Pasir Gudang",
  "Store",
];

// The 4 common products — IDs will be resolved at runtime
const QUICK_ADD_PRODUCTS = [
  "DIESEL EURO 5",
  "TRANSPORTATION CHARGES (TRIP)",
  "TRANSPORTATION CHARGES (LT)",
  "EMPTY DRUM",
];

interface FormItem {
  product_id: string;
  quantity_liters: string;
  unit_price: string;
  cost_to_agent: string;
  sst_rate: number;
}

const EMPTY_ITEM: FormItem = {
  product_id: "",
  quantity_liters: "",
  unit_price: "",
  cost_to_agent: "",
  sst_rate: 0,
};

interface OrderFormProps {
  existingOrder?: Order;
}

export default function OrderForm({ existingOrder }: OrderFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { driverProfile } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Determine default date: if after 5pm MYT, default to tomorrow
  const getDefaultDate = () => {
    const now = new Date();
    // Convert to MYT (UTC+8)
    const myt = new Date(now.getTime() + (8 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    const hour = myt.getHours();
    if (hour >= 17) {
      // After 5pm, default to tomorrow
      const tomorrow = new Date(myt);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split("T")[0];
    }
    return myt.toISOString().split("T")[0];
  };

  const [form, setForm] = useState({
    order_date: existingOrder?.order_date ?? getDefaultDate(),
    customer_id: existingOrder?.customer_id ?? "",
    destination: existingOrder?.destination ?? "",
    load_from: existingOrder?.load_from ?? "",
    driver_id: existingOrder?.driver_id ?? "",
    vehicle_id: existingOrder?.vehicle_id ?? "",
    order_type: existingOrder?.order_type ?? "own",
    agent_name: existingOrder?.agent_name ?? "",
    remark: existingOrder?.remark ?? "",
    delivery_remark: existingOrder?.delivery_remark ?? "",
    wages: existingOrder?.wages?.toString() ?? "",
    allowance_liters: existingOrder?.allowance_liters?.toString() ?? "",
    allowance_unit_price: existingOrder?.allowance_unit_price?.toString() ?? "0.50",
    special_allowance: existingOrder?.special_allowance?.toString() ?? "",
    transport: existingOrder?.transport?.toString() ?? "",
  });

  // Line items state — starts empty, user adds via quick-add buttons
  const [items, setItems] = useState<FormItem[]>([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadDropdowns() {
      const allCustomers: Customer[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("customers").select("id,name,short_name,agent_id").eq("is_active", true).order("name").range(from, from + 999);
        const rows = (data ?? []) as Customer[];
        allCustomers.push(...rows);
        if (rows.length < 1000) break;
        from += 1000;
      }
      setCustomers(allCustomers);

      if (existingOrder?.customer_id) {
        const match = allCustomers.find((c) => c.id === existingOrder.customer_id);
        if (match) setCustomerSearch(match.short_name || match.name);
      }

      const [p, d, v, ag] = await Promise.all([
        supabase.from("products").select("id,name,unit,default_price,sst_rate").eq("is_active", true).order("name"),
        supabase.from("drivers").select("id,name,role").eq("is_active", true).order("name"),
        supabase.from("vehicles").select("id,plate_number,type").eq("is_active", true).order("plate_number"),
        supabase.from("agents").select("id,name,is_active").eq("is_active", true).order("name"),
      ]);
      const loadedProducts = (p.data as Product[]) ?? [];
      setProducts(loadedProducts);
      setDrivers((d.data as Driver[]) ?? []);
      setVehicles((v.data as Vehicle[]) ?? []);
      setAgents((ag.data as Agent[]) ?? []);

      // Load existing order items
      if (existingOrder?.id) {
        const { data: existingItems } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", existingOrder.id)
          .order("sort_order");
        if (existingItems && existingItems.length > 0) {
          setItems(existingItems.map((item: { product_id: string | null; quantity_liters: number; unit_price: number; cost_to_agent: number | null; sst_rate: number }) => ({
            product_id: item.product_id ?? "",
            quantity_liters: item.quantity_liters?.toString() ?? "",
            unit_price: item.unit_price?.toString() ?? "",
            cost_to_agent: item.cost_to_agent?.toString() ?? "",
            sst_rate: item.sst_rate ?? 0,
          })));
        } else if (existingOrder.product_id) {
          // Fallback: load from legacy fields
          const prod = loadedProducts.find((pp) => pp.id === existingOrder.product_id);
          setItems([{
            product_id: existingOrder.product_id ?? "",
            quantity_liters: existingOrder.quantity_liters?.toString() ?? "",
            unit_price: existingOrder.unit_price?.toString() ?? "",
            cost_to_agent: existingOrder.cost_to_agent?.toString() ?? "",
            sst_rate: prod?.sst_rate ?? 0,
          }]);
        }
      }
    }
    loadDropdowns();
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved addresses when customer changes
  async function loadAddresses(customerId: string) {
    if (!customerId) { setSavedAddresses([]); return; }
    const { data } = await supabase
      .from("customer_addresses")
      .select("address")
      .eq("customer_id", customerId)
      .order("address");
    setSavedAddresses((data ?? []).map((a: { address: string }) => a.address));
  }

  useEffect(() => {
    if (existingOrder?.customer_id) loadAddresses(existingOrder.customer_id);
  }, [existingOrder?.customer_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill agent when customer is selected
  function handleCustomerSelect(customer: Customer) {
    const agentMatch = customer.agent_id ? agents.find((a) => a.id === customer.agent_id) : null;
    setForm({
      ...form,
      customer_id: customer.id,
      destination: "",
      order_type: agentMatch ? "agent" : "own",
      agent_name: agentMatch?.name ?? "",
    });
    setCustomerSearch(customer.short_name || customer.name);
    setShowCustomerDropdown(false);
    loadAddresses(customer.id);
  }

  // Item helpers
  function updateItem(index: number, field: keyof FormItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      // Auto-fill SST rate when product changes (but NOT price — user enters manually)
      if (field === "product_id") {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          updated.sst_rate = prod.sst_rate ?? 0;
        }
      }
      return updated;
    }));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Quick-add a common product
  function quickAddProduct(productName: string) {
    const prod = products.find((p) => p.name === productName);
    if (!prod) return;
    // Check if already added
    if (items.some((item) => item.product_id === prod.id)) {
      toast.info(`${productName} is already in the list.`);
      return;
    }
    setItems((prev) => [...prev, { ...EMPTY_ITEM, product_id: prod.id, sst_rate: prod.sst_rate ?? 0 }]);
  }

  // Computed totals
  const itemTotals = items.map((item) => {
    const qty = parseFloat(item.quantity_liters) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const lineTotal = qty * price;
    const sst = lineTotal * (item.sst_rate / 100);
    return { qty, price, lineTotal, sst };
  });
  const totalQty = itemTotals.reduce((s, t) => s + t.qty, 0);
  const totalSale = itemTotals.reduce((s, t) => s + t.lineTotal, 0);
  const totalSST = itemTotals.reduce((s, t) => s + t.sst, 0);
  const grandTotal = totalSale + totalSST;

  // Only show Road Tankers
  const truckOptions = vehicles.filter((v) => v.type === "Road Tanker");

  const isAgent = form.order_type === "agent";

  async function handleSave() {
    if (!form.customer_id) { toast.error("Customer is required."); return; }
    if (!form.order_date) { toast.error("Order date is required."); return; }
    const validItems = items.filter((item) => item.product_id);
    if (validItems.length === 0) { toast.error("At least one product is required."); return; }
    setSaving(true);

    // Build order payload
    const firstItem = validItems[0];
    const payload = {
      order_date: form.order_date,
      customer_id: form.customer_id,
      destination: (form.destination.trim() === "_custom" ? "" : form.destination.trim()) || null,
      product_id: firstItem.product_id || null,
      quantity_liters: totalQty || null,
      unit_price: firstItem.unit_price ? parseFloat(firstItem.unit_price) : null,
      cost_to_agent: isAgent && firstItem.cost_to_agent ? parseFloat(firstItem.cost_to_agent) : null,
      total_sale: totalSale || null,
      sst_amount: totalSST || null,
      load_from: form.load_from || null,
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      order_type: form.order_type as "own" | "agent",
      agent_name: isAgent && form.agent_name ? form.agent_name.trim() : null,
      remark: form.remark.trim() || null,
      delivery_remark: form.delivery_remark.trim() || null,
      wages: form.wages ? parseFloat(form.wages) : null,
      allowance_liters: form.allowance_liters ? parseFloat(form.allowance_liters) : null,
      allowance_unit_price: form.allowance_unit_price ? parseFloat(form.allowance_unit_price) : null,
      special_allowance: form.special_allowance ? parseFloat(form.special_allowance) : null,
      transport: form.transport ? parseFloat(form.transport) : null,
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
      toast.error(err.message);
      setSaving(false);
      return;
    }

    // Save order items
    if (orderId) {
      await supabase.from("order_items").delete().eq("order_id", orderId);
      const itemPayload = validItems.map((item, idx) => ({
        order_id: orderId,
        product_id: item.product_id || null,
        quantity_liters: parseFloat(item.quantity_liters) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        cost_to_agent: isAgent && item.cost_to_agent ? parseFloat(item.cost_to_agent) : null,
        sst_rate: item.sst_rate ?? 0,
        sort_order: idx,
      }));
      const { error: itemErr } = await supabase.from("order_items").insert(itemPayload);
      if (itemErr) {
        toast.error("Order saved but failed to save line items: " + itemErr.message);
      }
    }

    // Send WhatsApp notifications for new orders
    if (!existingOrder && orderId) {
      fetch(`/api/orders/${orderId}`, { method: "POST" }).catch(() => {});
    }

    router.push(orderId ? `/orders/${orderId}` : "/orders");
  }

  // Helper: only show value if it matches a loaded option
  const safeDriverValue = form.driver_id && drivers.some((d) => d.id === form.driver_id) ? form.driver_id : "_none";
  const safeVehicleValue = form.vehicle_id && vehicles.some((v) => v.id === form.vehicle_id) ? form.vehicle_id : "_none";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
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
                  <label className="text-sm font-medium">Delivery Date *</label>
                  <Input
                    type="date"
                    value={form.order_date}
                    onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <StatusBadge status={existingOrder?.status ?? "pending"} type="order" />
                </div>
              </div>

              <div className="relative">
                <label className="text-sm font-medium">Customer *</label>
                <Input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                    if (!e.target.value) setForm({ ...form, customer_id: "", destination: "", order_type: "own", agent_name: "" });
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                  placeholder="Type to search customer..."
                  autoComplete="off"
                />
                {showCustomerDropdown && customerSearch.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
                    {customers
                      .filter((c) => {
                        const q = customerSearch.toLowerCase();
                        return c.name.toLowerCase().includes(q) ||
                          (c.short_name && c.short_name.toLowerCase().includes(q));
                      })
                      .slice(0, 50)
                      .map((c) => (
                        <div
                          key={c.id}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent ${form.customer_id === c.id ? "bg-accent font-medium" : ""}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCustomerSelect(c);
                          }}
                        >
                          {c.name}
                          {c.short_name && <span className="ml-2 text-xs text-muted-foreground">({c.short_name})</span>}
                          {c.agent_id && <span className="ml-2 text-xs text-orange-500">[Agent]</span>}
                        </div>
                      ))}
                    {customers.filter((c) => {
                      const q = customerSearch.toLowerCase();
                      return c.name.toLowerCase().includes(q) || (c.short_name && c.short_name.toLowerCase().includes(q));
                    }).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No customer found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Agent info — auto-filled, shown only when customer has agent */}
              {isAgent && form.agent_name && (
                <div className="p-2 rounded-md border border-muted">
                  <span className="text-xs text-muted-foreground">Agent</span>
                  <p className="text-sm font-medium">{form.agent_name}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Destination</label>
                {savedAddresses.length > 0 ? (
                  <div className="space-y-2">
                    <Select
                      value={savedAddresses.includes(form.destination) ? form.destination : "_custom"}
                      onValueChange={(v) => {
                        if (v && v !== "_custom") setForm({ ...form, destination: v });
                        else if (v === "_custom") setForm({ ...form, destination: "" });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select address...">{(v: string | null) => { if (!v || v === "_custom") return "Type address manually"; return v; }}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {savedAddresses.map((a) => (
                          <SelectItem key={a} value={a} label={a}>{a}</SelectItem>
                        ))}
                        <SelectItem value="_custom" label="+ Type address manually">+ Type address manually</SelectItem>
                      </SelectContent>
                    </Select>
                    {!savedAddresses.includes(form.destination) && (
                      <Input
                        value={form.destination}
                        onChange={(e) => setForm({ ...form, destination: e.target.value })}
                        placeholder="Enter address..."
                      />
                    )}
                  </div>
                ) : (
                  <Input
                    value={form.destination}
                    onChange={(e) => setForm({ ...form, destination: e.target.value })}
                    placeholder="Delivery address / site name"
                  />
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Remark (Internal)</label>
                <Textarea
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  rows={2}
                  placeholder="Internal notes..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Remark for Delivery</label>
                <Textarea
                  value={form.delivery_remark}
                  onChange={(e) => setForm({ ...form, delivery_remark: e.target.value })}
                  rows={2}
                  placeholder="e.g. deliver before 8am, call before arrive..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Items</CardTitle>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>
              {/* Quick-add buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                {QUICK_ADD_PRODUCTS.map((name) => {
                  const prod = products.find((p) => p.name === name);
                  if (!prod) return null;
                  const alreadyAdded = items.some((item) => item.product_id === prod.id);
                  return (
                    <Button
                      key={name}
                      variant={alreadyAdded ? "default" : "outline"}
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => quickAddProduct(name)}
                      disabled={alreadyAdded}
                    >
                      {name === "DIESEL EURO 5" && <Fuel className="h-3 w-3" />}
                      {name.startsWith("TRANSPORTATION") && <Truck className="h-3 w-3" />}
                      {name === "EMPTY DRUM" && <Package className="h-3 w-3" />}
                      {name === "DIESEL EURO 5" ? "Diesel" :
                       name === "TRANSPORTATION CHARGES (TRIP)" ? "Transport (Trip)" :
                       name === "TRANSPORTATION CHARGES (LT)" ? "Transport (LT)" :
                       "Empty Drum"}
                    </Button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg border-dashed">
                  Use the buttons above to add items
                </div>
              )}
              {items.map((item, idx) => (
                <div key={idx} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Product</label>
                    <Select
                      value={item.product_id && products.some((p) => p.id === item.product_id) ? item.product_id : "_none"}
                      onValueChange={(v) => v && v !== "_none" && updateItem(idx, "product_id", v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select product...">{(v: string | null) => { if (!v || v === "_none") return "Select product..."; return products.find((p) => p.id === v)?.name ?? v; }}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none" label="Select product...">Select product...</SelectItem>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id} label={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={`grid gap-3 ${isAgent ? "grid-cols-3" : "grid-cols-2"}`}>
                    <div>
                      <label className="text-xs font-medium">Qty ({products.find((p) => p.id === item.product_id)?.unit ?? "L"})</label>
                      <Input
                        type="number"
                        value={item.quantity_liters}
                        onChange={(e) => updateItem(idx, "quantity_liters", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Unit Price</label>
                      <Input
                        type="number"
                        step="0.001"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                        placeholder="0.000"
                      />
                    </div>
                    {isAgent && (
                      <div>
                        <label className="text-xs font-medium">Cost to Agent</label>
                        <Input
                          type="number"
                          step="0.001"
                          value={item.cost_to_agent}
                          onChange={(e) => updateItem(idx, "cost_to_agent", e.target.value)}
                          placeholder="0.000"
                        />
                      </div>
                    )}
                  </div>
                  {itemTotals[idx] && itemTotals[idx].lineTotal > 0 && (
                    <div className="text-xs text-muted-foreground flex justify-between pt-1 border-t">
                      <span>Line total: RM {itemTotals[idx].lineTotal.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                      <span>SST ({item.sst_rate}%): RM {itemTotals[idx].sst.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                      {isAgent && (() => {
                        const commPerL = (parseFloat(item.unit_price) || 0) - (parseFloat(item.cost_to_agent) || 0);
                        const qty = parseFloat(item.quantity_liters) || 0;
                        return commPerL > 0 ? (
                          <span className="text-status-approved-fg font-medium">Commission: RM {(commPerL * qty).toLocaleString("en-MY", { minimumFractionDigits: 2 })} ({commPerL.toFixed(3)}/L)</span>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Operations & Logistics */}
          <Card>
            <CardHeader><CardTitle className="text-base">Operations & Logistics</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Driver</label>
                  <Select
                    value={safeDriverValue}
                    onValueChange={(v) => v && setForm({ ...form, driver_id: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select driver...">{(v: string | null) => { if (!v || v === "_none") return "None"; return drivers.find((d) => d.id === v)?.name ?? v; }}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none" label="None">None</SelectItem>
                      {drivers.filter((d) => d.role === "driver").map((d) => (
                        <SelectItem key={d.id} value={d.id} label={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Truck</label>
                  <Select
                    value={safeVehicleValue}
                    onValueChange={(v) => v && setForm({ ...form, vehicle_id: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select truck...">{(v: string | null) => { if (!v || v === "_none") return "None"; return truckOptions.find((vh) => vh.id === v)?.plate_number ?? v; }}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none" label="None">None</SelectItem>
                      {truckOptions.map((v) => (
                        <SelectItem key={v.id} value={v.id} label={v.plate_number}>{v.plate_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Load From</label>
                <Select
                  value={form.load_from || "_none"}
                  onValueChange={(v) => v && setForm({ ...form, load_from: v === "_none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select source...">{(v: string | null) => { if (!v || v === "_none") return "None"; return v; }}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" label="None">None</SelectItem>
                    {LOAD_FROM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} label={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Allowance (LT)</label>
                  <Input type="number" value={form.allowance_liters} onChange={(e) => setForm({ ...form, allowance_liters: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm font-medium">Allowance (Unit Price)</label>
                  <Input type="number" step="0.01" value={form.allowance_unit_price} onChange={(e) => setForm({ ...form, allowance_unit_price: e.target.value })} placeholder="0.50" />
                </div>
                <div>
                  <label className="text-sm font-medium">Special Allowance (RM)</label>
                  <Input type="number" value={form.special_allowance} onChange={(e) => setForm({ ...form, special_allowance: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Transport (RM)</label>
                <Input type="number" value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })} placeholder="0.00" />
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
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium">{items.filter((i) => i.product_id).length}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="text-muted-foreground">Total Sale</span>
                <span className="font-bold text-primary">
                  {totalSale ? `RM ${totalSale.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total SST</span>
                <span>{totalSST ? `RM ${totalSST.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "—"}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-3">
                <span>Grand Total</span>
                <span className="text-accent">
                  {grandTotal ? `RM ${grandTotal.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <Button className="w-full" onClick={handleSave} disabled={saving}>
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
