"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { FAB } from "@/components/ui/fab";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Send, MessageSquare, Check } from "lucide-react";
import { ColumnPicker } from "@/components/ui/column-picker";
import { useColumnPreferences } from "@/hooks/use-column-preferences";
import { format, addDays, isToday, isTomorrow, isYesterday } from "date-fns";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";

const LOAD_FROM_OPTIONS = [
  "Caltex Pasir Gudang",
  "CYL",
  "Petron Pasir Gudang",
  "Petronas Melaka",
  "Petronas Pasir Gudang",
  "Store",
];

const PAGE_SIZE = 50;

export default function OrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { role } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeQuickDate, setActiveQuickDate] = useState<string | null>(null);

  // Quick date shortcuts
  const quickDates = useMemo(() => {
    const today = new Date();
    return [
      { key: "yesterday", label: "Yesterday", date: format(addDays(today, -1), "yyyy-MM-dd") },
      { key: "today", label: "Today", date: format(today, "yyyy-MM-dd") },
      { key: "tomorrow", label: "Tomorrow", date: format(addDays(today, 1), "yyyy-MM-dd") },
      { key: "day_after", label: format(addDays(today, 2), "EEE, d MMM"), date: format(addDays(today, 2), "yyyy-MM-dd") },
    ];
  }, []);

  function setQuickDate(key: string, date: string) {
    if (activeQuickDate === key) {
      // Deselect
      setActiveQuickDate(null);
      setDateFrom("");
      setDateTo("");
    } else {
      setActiveQuickDate(key);
      setDateFrom(date);
      setDateTo(date);
    }
    setPage(0);
  }

  const canInlineEdit = role === "admin" || role === "manager";
  const canSendToDriver = role === "admin" || role === "manager" || role === "office";

  // Column picker preferences
  const ALL_COLUMN_KEYS = useMemo(
    () => ["customer", "destination", "qty", "remark", "delivery_remark", "truck", "driver", "load_from", "status", "actions"],
    []
  );
  const DEFAULT_VISIBLE = useMemo(
    () => ["customer", "destination", "qty", "remark", "delivery_remark", "truck", "driver", "load_from", "status", "actions"],
    []
  );
  const {
    visibleColumns,
    toggleColumn,
    setColumnWidth,
    resetPreferences,
    prefs,
  } = useColumnPreferences("orders-table", ALL_COLUMN_KEYS, DEFAULT_VISIBLE);

  // Lookup maps for names
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [driverMap, setDriverMap] = useState<Record<string, string>>({});
  const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});
  const [driverList, setDriverList] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [vehicleList, setVehicleList] = useState<{ id: string; plate_number: string }[]>([]);
  const [sentOrders, setSentOrders] = useState<Set<string>>(new Set());

  // Load lookup maps once
  useEffect(() => {
    async function loadLookups() {
      const [c, p, d, v] = await Promise.all([
        supabase.from("customers").select("id, name, short_name").limit(10000),
        supabase.from("products").select("id, name").limit(10000),
        supabase.from("drivers").select("id, name, role").order("name").limit(10000),
        supabase.from("vehicles").select("id, plate_number, type").order("plate_number").limit(10000),
      ]);
      const cm: Record<string, string> = {};
      for (const row of (c.data ?? []) as { id: string; name: string; short_name?: string | null }[]) {
        cm[row.id] = row.short_name || row.name;
      }
      setCustomerMap(cm);
      const pm: Record<string, string> = {};
      for (const row of (p.data ?? []) as { id: string; name: string }[]) pm[row.id] = row.name;
      setProductMap(pm);
      const driverRows = (d.data ?? []) as { id: string; name: string; role?: string }[];
      const dm: Record<string, string> = {};
      for (const row of driverRows) dm[row.id] = row.name;
      setDriverMap(dm);
      setDriverList(driverRows);
      const vehicleRows = ((v.data ?? []) as { id: string; plate_number: string; type?: string | null }[]).filter(
        (vh) => vh.type === "Road Tanker"
      );
      const vm: Record<string, string> = {};
      for (const row of vehicleRows) vm[row.id] = row.plate_number;
      setVehicleMap(vm);
      setVehicleList(vehicleRows);
    }
    loadLookups();
  }, [supabase]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select(
        `id, order_date, customer_id, destination, product_id, quantity_liters, unit_price, total_sale, dn_number, invoice_number, status, bukku_sync_status, stock_sync_status, driver_id, vehicle_id, load_from, remark, delivery_remark, items:order_items(product_id, quantity_liters), customer:customer_id(id, name, short_name)`,
        { count: "exact" }
      )
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (dateFrom) query = query.gte("order_date", dateFrom);
    if (dateTo) query = query.lte("order_date", dateTo);
    if (search.trim()) {
      const sanitized = search.replace(/[%(),.*]/g, "");
      if (sanitized) {
        query = query.or(
          `invoice_number.ilike.%${sanitized}%,dn_number.ilike.%${sanitized}%`
        );
      }
    }

    const { data, count } = await query;
    const orderList = (data as Order[]) ?? [];
    setOrders(orderList);
    setTotal(count ?? 0);

    // Check which orders have been sent to driver
    const orderIds = orderList.filter((o) => o.driver_id).map((o) => o.id);
    if (orderIds.length > 0) {
      const { data: logs } = await supabase
        .from("notifications_log")
        .select("reference_id")
        .eq("type", "delivery_to_driver")
        .eq("status", "sent")
        .in("reference_id", orderIds);
      setSentOrders(new Set((logs ?? []).map((l: { reference_id: string }) => l.reference_id)));
    } else {
      setSentOrders(new Set());
    }

    setLoading(false);
  }, [supabase, page, statusFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    const timer = setTimeout(fetchOrders, 300);
    return () => clearTimeout(timer);
  }, [fetchOrders]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Inline update for manager
  async function inlineUpdate(orderId: string, field: string, value: string | null) {
    const { error } = await supabase.from("orders").update({ [field]: value }).eq("id", orderId);
    if (error) {
      toast.error("Failed to update");
    } else {
      // Update local state without full refetch
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, [field]: value } : o));
    }
  }

  // Acknowledge order
  async function handleAcknowledge(orderId: string) {
    setActionLoading(orderId);
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Failed");
    }
    await fetchOrders();
    setActionLoading(null);
  }

  // Mark as delivered
  async function handleDeliver(orderId: string) {
    setActionLoading(orderId);
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deliver" }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Failed");
    }
    await fetchOrders();
    setActionLoading(null);
  }

  // Send to driver
  async function handleNotifyDriver(orderId: string) {
    setActionLoading(orderId);
    const res = await fetch(`/api/orders/${orderId}/notify-driver`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      toast.success("Sent to driver");
      setSentOrders((prev) => new Set([...prev, orderId]));
    } else {
      toast.error(data.error || "Failed to send");
    }
    setActionLoading(null);
  }

  // --- Dispatch Orders to Driver ---
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDate, setSummaryDate] = useState("");
  const [summaryDriverId, setSummaryDriverId] = useState("");
  const [summaryPreview, setSummaryPreview] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [summaryLastSent, setSummaryLastSent] = useState<string | null>(null);

  function openSummaryDialog() {
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSummaryDate(format(tomorrow, "yyyy-MM-dd"));
    setSummaryDriverId("");
    setSummaryPreview(null);
    setSummaryLastSent(null);
    setSummaryOpen(true);
  }

  async function previewSummary() {
    if (!summaryDriverId || !summaryDate) return;
    setPreviewLoading(true);
    setSummaryPreview(null);

    // Fetch orders for the selected driver on the selected date
    const { data } = await supabase
      .from("orders")
      .select(
        `id, order_date, destination, quantity_liters,
         customer:customer_id(id, name, short_name),
         items:order_items(product_id, quantity_liters, product:product_id(name))`
      )
      .eq("driver_id", summaryDriverId)
      .eq("order_date", summaryDate)
      .not("status", "in", '("cancelled","rejected")')
      .order("created_at");

    if (!data || data.length === 0) {
      setSummaryPreview("No orders found for this driver on this date.");
      setPreviewLoading(false);
      return;
    }

    const [y, m, d] = summaryDate.split("-");
    const fmtDate = `${d}/${m}/${y}`;

    const lines = data.map((o: Record<string, unknown>) => {
      const cust = o.customer as { name: string; short_name?: string | null } | null;
      const custName = cust?.short_name || cust?.name || "—";
      const items = (o.items ?? []) as { product_id: string; quantity_liters: number; product: { name: string } | null }[];
      const dieselItem = items.find((i) => (i.product?.name ?? "").toUpperCase().includes("DIESEL"));
      const ltItem = items.find((i) => (i.product?.name ?? "").toUpperCase().includes("(LT)"));
      const qty = dieselItem?.quantity_liters ?? ltItem?.quantity_liters ?? o.quantity_liters;
      const qtyStr = qty ? `${Number(qty).toLocaleString()}L` : "—";
      const dest = (String(o.destination ?? "—")).split("\n")[0].trim();
      const shortDest = dest.length > 40 ? dest.slice(0, 40) + "…" : dest;
      return `${custName}, ${qtyStr}, ${shortDest}`;
    });

    setSummaryPreview(`📋 *${fmtDate}*\n\n${lines.join("\n")}`);

    // Check if already sent before
    const { data: logEntry } = await supabase
      .from("notifications_log")
      .select("sent_at")
      .eq("type", "driver_daily_summary")
      .eq("reference_id", `summary-${summaryDriverId}-${summaryDate}`)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSummaryLastSent(logEntry?.sent_at ?? null);

    setPreviewLoading(false);
  }

  async function sendSummary() {
    if (!summaryDriverId || !summaryDate) return;
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/orders/send-driver-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: summaryDriverId, date: summaryDate }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Sent to ${driverMap[summaryDriverId]} (${data.orderCount} orders)`);
        setSummaryLastSent(new Date().toISOString());
      } else {
        toast.error(data.error || "Failed to send");
      }
    } catch {
      toast.error("Network error");
    }
    setSummaryLoading(false);
  }

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (dateFrom && !activeQuickDate ? 1 : 0) +
    (dateTo && !activeQuickDate ? 1 : 0) +
    (activeQuickDate ? 1 : 0) +
    (search ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setActiveQuickDate(null);
    setPage(0);
  };

  // Column definitions — order: Customer, Destination, Quantity, Remark, Remark for Driver, Truck No, Driver, Load From, Status, Actions
  interface ColDef {
    key: string;
    label: string;
    className?: string;
    hideClass?: string;
    render: (o: Order) => React.ReactNode;
  }

  const columns: ColDef[] = [
    {
      key: "customer",
      label: "Customer",
      className: "whitespace-nowrap max-w-[140px]",
      render: (o) => {
        const cust = o.customer as { name: string; short_name?: string | null } | null;
        return (
          <span className="block truncate" title={cust?.name || customerMap[o.customer_id]}>
            {cust?.short_name || cust?.name || customerMap[o.customer_id] || "—"}
          </span>
        );
      },
    },
    {
      key: "destination",
      label: "Destination",
      className: "max-w-[180px]",
      render: (o) => (
        <span className="block truncate" title={o.destination ?? ""}>{(!o.destination || o.destination === "_custom") ? "—" : o.destination}</span>
      ),
    },
    {
      key: "qty",
      label: "Quantity",
      className: "text-right whitespace-nowrap",
      render: (o) => {
        const items = (o.items ?? []) as unknown as { product_id: string | null; quantity_liters: number | null }[];
        const getName = (pid: string | null) => pid ? (productMap[pid] ?? "").toUpperCase() : "";
        const dieselItem = items.find((i) => getName(i.product_id).includes("DIESEL"));
        const ltItem = items.find((i) => getName(i.product_id).includes("(LT)"));
        const qty = dieselItem?.quantity_liters ?? ltItem?.quantity_liters ?? o.quantity_liters;
        return qty ? qty.toLocaleString() + " L" : "—";
      },
    },
    {
      key: "remark",
      label: "Remark",
      className: "max-w-[150px]",
      hideClass: "hidden lg:table-cell",
      render: (o) => (
        <span className="block truncate" title={o.remark ?? ""}>{o.remark || "—"}</span>
      ),
    },
    {
      key: "delivery_remark",
      label: "Remark for Driver",
      className: "max-w-[150px]",
      hideClass: "hidden lg:table-cell",
      render: (o) => (
        <span className="block truncate" title={o.delivery_remark ?? ""}>{o.delivery_remark || "—"}</span>
      ),
    },
    {
      key: "truck",
      label: "Truck No",
      className: "whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      render: (o) => {
        if (canInlineEdit && o.stock_sync_status !== "synced") {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select value={o.vehicle_id ?? ""} onValueChange={(v) => { inlineUpdate(o.id, "vehicle_id", v || null); }}>
                <SelectTrigger className="h-6 w-auto min-w-[80px] text-xs">
                  <SelectValue>{o.vehicle_id ? vehicleMap[o.vehicle_id] ?? "—" : "—"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vehicleList.map((v) => (
                    <SelectItem key={v.id} value={v.id} label={v.plate_number}>{v.plate_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return o.vehicle_id ? vehicleMap[o.vehicle_id] ?? "—" : "—";
      },
    },
    {
      key: "driver",
      label: "Driver",
      className: "whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      render: (o) => {
        if (canInlineEdit && o.stock_sync_status !== "synced") {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select value={o.driver_id ?? ""} onValueChange={(v) => { inlineUpdate(o.id, "driver_id", v || null); }}>
                <SelectTrigger className="h-6 w-auto min-w-[90px] text-xs">
                  <SelectValue>{o.driver_id ? driverMap[o.driver_id] ?? "—" : "—"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {driverList.map((d) => (
                    <SelectItem key={d.id} value={d.id} label={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return o.driver_id ? driverMap[o.driver_id] ?? "—" : "—";
      },
    },
    {
      key: "load_from",
      label: "Load From",
      className: "whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      render: (o) => {
        if (canInlineEdit && o.stock_sync_status !== "synced") {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select value={o.load_from ?? ""} onValueChange={(v) => { inlineUpdate(o.id, "load_from", v || null); }}>
                <SelectTrigger className="h-6 w-auto min-w-[90px] text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {LOAD_FROM_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt} label={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return o.load_from ?? "—";
      },
    },
    {
      key: "status",
      label: "Status",
      className: "text-center whitespace-nowrap",
      render: (o) => {
        if (canInlineEdit && o.status === "pending" && o.stock_sync_status !== "synced") {
          return (
            <Button
              variant="outline"
              size="xs"
              className="h-5 text-[10px] border-status-approved-fg/30 text-status-approved-fg"
              disabled={actionLoading === o.id}
              onClick={(e) => { e.stopPropagation(); handleAcknowledge(o.id); }}
            >
              Acknowledge
            </Button>
          );
        }
        if (canInlineEdit && o.status === "approved" && o.stock_sync_status !== "synced") {
          return (
            <Button
              variant="outline"
              size="xs"
              className="h-5 text-[10px] border-status-delivered-fg/30 text-status-delivered-fg"
              disabled={actionLoading === o.id}
              onClick={(e) => { e.stopPropagation(); handleDeliver(o.id); }}
            >
              Delivered
            </Button>
          );
        }
        return <StatusBadge status={o.status} type="order" />;
      },
    },
    {
      key: "actions",
      label: "",
      className: "text-center whitespace-nowrap w-[32px]",
      hideClass: "hidden lg:table-cell",
      render: (o) => {
        if (!canSendToDriver || !o.driver_id) return null;
        const wasSent = sentOrders.has(o.id);
        return (
          <div className="flex items-center gap-0.5 justify-center">
            {wasSent && <Check className="h-2.5 w-2.5 text-green-600" />}
            <Button
              variant="ghost"
              size="icon"
              className={`h-5 w-5 ${wasSent ? "text-green-600" : ""}`}
              title={wasSent ? "Sent — click to resend" : "Send to Driver"}
              disabled={actionLoading === o.id}
              onClick={(e) => { e.stopPropagation(); handleNotifyDriver(o.id); }}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        );
      },
    },
  ];

  // Filter columns based on visibility preferences
  const filteredColumns = useMemo(
    () => columns.filter((col) => visibleColumns.includes(col.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, visibleColumns]
  );

  // Column options for the picker (actions is locked/always visible)
  const columnPickerOptions = useMemo(
    () =>
      columns
        .filter((c) => c.label) // skip empty-label columns like actions
        .map((c) => ({ key: c.key, label: c.label })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns]
  );

  // Group orders by date
  const groupedOrders = useMemo(() => {
    const groups: { date: string; label: string; orders: Order[] }[] = [];
    let currentDate = "";
    for (const o of orders) {
      const d = o.order_date ?? "";
      if (d !== currentDate) {
        currentDate = d;
        let label = d ? format(new Date(d + "T00:00:00"), "EEE, d MMM yyyy") : "No Date";
        if (d) {
          const parsed = new Date(d + "T00:00:00");
          if (isToday(parsed)) label = "Today — " + label;
          else if (isTomorrow(parsed)) label = "Tomorrow — " + label;
          else if (isYesterday(parsed)) label = "Yesterday — " + label;
        }
        groups.push({ date: d, label, orders: [] });
      }
      groups[groups.length - 1].orders.push(o);
    }
    return groups;
  }, [orders]);

  return (
    <div className="p-3 md:p-4 space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Orders</h1>
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} total
          </p>
        </div>
        <div className="flex gap-1.5">
          <ColumnPicker
            columns={columnPickerOptions}
            visibleColumns={visibleColumns}
            onToggle={toggleColumn}
            onReset={resetPreferences}
          />
          {canSendToDriver && (
            <Button variant="outline" size="sm" onClick={openSummaryDialog} className="gap-1.5 hidden md:flex">
              <MessageSquare className="h-3.5 w-3.5" />
              Dispatch
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => router.push("/orders/new")}
            className="gap-1.5 hidden md:flex"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Quick date shortcuts */}
      <div className="flex gap-1.5 flex-wrap">
        {quickDates.map((qd) => (
          <Button
            key={qd.key}
            variant={activeQuickDate === qd.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setQuickDate(qd.key, qd.date)}
          >
            {qd.label}
          </Button>
        ))}
      </div>

      {/* Filters */}
      <FilterBar activeCount={activeFilterCount} onClear={clearFilters}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Invoice / DN..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 h-8 text-sm w-full md:w-44"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            if (v) {
              setStatusFilter(v);
              setPage(0);
            }
          }}
        >
          <SelectTrigger className="w-full md:w-32 h-8 text-sm">
            <SelectValue>{{ all: "All Status", pending: "Pending", approved: "Acknowledged", rejected: "Rejected", delivered: "Delivered", cancelled: "Cancelled" }[statusFilter] ?? statusFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="All Status">All Status</SelectItem>
            <SelectItem value="pending" label="Pending">Pending</SelectItem>
            <SelectItem value="approved" label="Acknowledged">Acknowledged</SelectItem>
            <SelectItem value="rejected" label="Rejected">Rejected</SelectItem>
            <SelectItem value="delivered" label="Delivered">Delivered</SelectItem>
            <SelectItem value="cancelled" label="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 w-full md:w-auto">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setActiveQuickDate(null);
              setDateFrom(e.target.value);
              setPage(0);
            }}
            className="flex-1 md:w-32 h-8 text-sm"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setActiveQuickDate(null);
              setDateTo(e.target.value);
              setPage(0);
            }}
            className="flex-1 md:w-32 h-8 text-sm"
          />
        </div>
      </FilterBar>

      {/* Compact grouped table */}
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No orders found.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[800px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {filteredColumns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={`h-7 px-1.5 text-xs ${col.className ?? ""} ${col.hideClass ?? ""}`}
                    >
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedOrders.map((group) => (
                  <React.Fragment key={group.date}>
                    {/* Day group header */}
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell
                        colSpan={filteredColumns.length}
                        className="py-1 px-1.5 text-xs font-semibold text-muted-foreground"
                      >
                        {group.label}
                        <span className="ml-2 font-normal">({group.orders.length})</span>
                      </TableCell>
                    </TableRow>
                    {/* Order rows */}
                    {group.orders.map((o) => (
                      <TableRow
                        key={o.id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => router.push(`/orders/${o.id}`)}
                      >
                        {filteredColumns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={`py-1 px-1.5 text-xs ${col.className ?? ""} ${col.hideClass ?? ""}`}
                          >
                            {col.render(o)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Pagination */}
      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {/* Mobile FAB */}
      <FAB onClick={() => router.push("/orders/new")} label="New Order" />

      {/* Dispatch Orders to Driver Dialog */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dispatch Orders to Driver</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={summaryDate}
                onChange={(e) => { setSummaryDate(e.target.value); setSummaryPreview(null); }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <Select value={summaryDriverId} onValueChange={(v) => { if (v) { setSummaryDriverId(v); setSummaryPreview(null); } }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver...">{summaryDriverId ? driverMap[summaryDriverId] ?? "—" : "Select driver..."}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {driverList.filter((d) => d.role === "driver").map((d) => (
                    <SelectItem key={d.id} value={d.id} label={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={!summaryDriverId || !summaryDate || previewLoading}
              onClick={previewSummary}
            >
              {previewLoading ? "Loading..." : "Preview"}
            </Button>
            {summaryPreview && (
              <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                {summaryPreview}
              </div>
            )}
            {summaryLastSent && (
              <p className="text-xs text-amber-600 text-center">
                Already sent on {new Date(summaryLastSent).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <Button
              className="w-full"
              disabled={!summaryPreview || summaryPreview.startsWith("No orders") || summaryLoading}
              onClick={sendSummary}
            >
              <Send className="h-4 w-4 mr-2" />
              {summaryLoading ? "Sending..." : summaryLastSent ? "Send Again" : "Send via WhatsApp"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
