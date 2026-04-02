"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataList, type DataColumn } from "@/components/ui/data-list";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { FAB } from "@/components/ui/fab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Send } from "lucide-react";
import { format } from "date-fns";
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

  const canInlineEdit = role === "admin" || role === "manager";
  const canSendToDriver = role === "admin" || role === "manager" || role === "office";

  // Lookup maps for names
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [driverMap, setDriverMap] = useState<Record<string, string>>({});
  const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});
  const [driverList, setDriverList] = useState<{ id: string; name: string }[]>([]);
  const [vehicleList, setVehicleList] = useState<{ id: string; plate_number: string }[]>([]);

  // Load lookup maps once
  useEffect(() => {
    async function loadLookups() {
      const [c, p, d, v] = await Promise.all([
        supabase.from("customers").select("id, name, short_name").limit(10000),
        supabase.from("products").select("id, name").limit(10000),
        supabase.from("drivers").select("id, name").order("name").limit(10000),
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
      const driverRows = (d.data ?? []) as { id: string; name: string }[];
      const dm: Record<string, string> = {};
      for (const row of driverRows) dm[row.id] = row.name;
      setDriverMap(dm);
      setDriverList(driverRows);
      const vehicleRows = ((v.data ?? []) as { id: string; plate_number: string; type?: string | null }[]).filter(
        (vh) => vh.type === "Road Tanker" || vh.plate_number === "CYL" || vh.plate_number === "SELF COLLECTION"
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
        `id, order_date, customer_id, destination, product_id, quantity_liters, unit_price, total_sale, dn_number, invoice_number, status, bukku_sync_status, driver_id, vehicle_id, load_from, delivery_remark, items:order_items(product_id, quantity_liters), customer:customer_id(id, name, short_name)`,
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
    setOrders((data as Order[]) ?? []);
    setTotal(count ?? 0);
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

  // Send to driver
  async function handleNotifyDriver(orderId: string) {
    setActionLoading(orderId);
    const res = await fetch(`/api/orders/${orderId}/notify-driver`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      toast.success("Sent to driver");
    } else {
      toast.error(data.error || "Failed to send");
    }
    setActionLoading(null);
  }

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (search ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(0);
  };

  const columns: DataColumn<Order>[] = [
    {
      key: "date",
      label: "Date",
      className: "whitespace-nowrap",
      mobileVisible: true,
      mobileSecondary: true,
      render: (o) =>
        o.order_date
          ? format(new Date(o.order_date + "T00:00:00"), "d MMM yy")
          : "—",
    },
    {
      key: "customer",
      label: "Customer",
      className: "whitespace-nowrap max-w-[140px]",
      mobilePrimary: true,
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
      key: "load_from",
      label: "Load From",
      className: "whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      render: (o) => {
        if (canInlineEdit) {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select value={o.load_from ?? ""} onValueChange={(v) => { inlineUpdate(o.id, "load_from", v || null); }}>
                <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
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
        return <span className="text-sm">{o.load_from ?? "—"}</span>;
      },
    },
    {
      key: "destination",
      label: "Destination",
      className: "max-w-[180px]",
      mobileVisible: true,
      render: (o) => (
        <span className="block truncate text-sm" title={o.destination ?? ""}>{o.destination ?? "—"}</span>
      ),
    },
    {
      key: "qty",
      label: "Qty (L)",
      className: "text-right whitespace-nowrap",
      mobileVisible: true,
      render: (o) => {
        const items = (o.items ?? []) as unknown as { product_id: string | null; quantity_liters: number | null }[];
        const getName = (pid: string | null) => pid ? (productMap[pid] ?? "").toUpperCase() : "";
        const dieselItem = items.find((i) => getName(i.product_id).includes("DIESEL"));
        const ltItem = items.find((i) => getName(i.product_id).includes("(LT)"));
        const qty = dieselItem?.quantity_liters ?? ltItem?.quantity_liters ?? o.quantity_liters;
        return (
          <span className="font-mono text-sm">
            {qty?.toLocaleString() ?? "—"}
          </span>
        );
      },
    },
    {
      key: "total",
      label: "Total",
      className: "text-right whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      mobileVisible: true,
      render: (o) =>
        o.total_sale
          ? `RM ${o.total_sale.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
          : "—",
    },
    {
      key: "driver",
      label: "Driver",
      className: "whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      render: (o) => {
        if (canInlineEdit) {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select value={o.driver_id ?? ""} onValueChange={(v) => { inlineUpdate(o.id, "driver_id", v || null); }}>
                <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
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
        return <span className="text-sm">{o.driver_id ? driverMap[o.driver_id] ?? "—" : "—"}</span>;
      },
    },
    {
      key: "truck",
      label: "Truck",
      className: "whitespace-nowrap",
      hideClass: "hidden xl:table-cell",
      render: (o) => {
        if (canInlineEdit) {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select value={o.vehicle_id ?? ""} onValueChange={(v) => { inlineUpdate(o.id, "vehicle_id", v || null); }}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs">
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
        return <span className="text-sm">{o.vehicle_id ? vehicleMap[o.vehicle_id] ?? "—" : "—"}</span>;
      },
    },
    {
      key: "status",
      label: "Status",
      className: "text-center whitespace-nowrap",
      mobileVisible: true,
      render: (o) => {
        if (canInlineEdit && o.status === "pending") {
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs border-status-approved-fg/30 text-status-approved-fg"
              disabled={actionLoading === o.id}
              onClick={(e) => { e.stopPropagation(); handleAcknowledge(o.id); }}
            >
              Acknowledge
            </Button>
          );
        }
        return <StatusBadge status={o.status} type="order" />;
      },
    },
    {
      key: "actions",
      label: "",
      className: "text-center whitespace-nowrap w-[40px]",
      hideClass: "hidden lg:table-cell",
      render: (o) => {
        if (!canSendToDriver || !o.driver_id) return null;
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Send to Driver"
            disabled={actionLoading === o.id}
            onClick={(e) => { e.stopPropagation(); handleNotifyDriver(o.id); }}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        );
      },
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} total orders
          </p>
        </div>
        <Button
          onClick={() => router.push("/orders/new")}
          className="gap-2 hidden md:flex"
        >
          <Plus className="h-4 w-4" />
          New Order
        </Button>
      </div>

      {/* Filters */}
      <FilterBar activeCount={activeFilterCount} onClear={clearFilters}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Invoice / DN number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 w-full md:w-52"
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
          <SelectTrigger className="w-full md:w-36">
            <SelectValue placeholder="All Status" />
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
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
            className="flex-1 md:w-36"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
            className="flex-1 md:w-36"
          />
        </div>
      </FilterBar>

      {/* Data */}
      <DataList
        data={orders}
        columns={columns}
        keyExtractor={(o) => o.id}
        onRowClick={(o) => router.push(`/orders/${o.id}`)}
        loading={loading}
        emptyMessage="No orders found."
        tableClassName="min-w-[900px]"
      />

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
    </div>
  );
}
