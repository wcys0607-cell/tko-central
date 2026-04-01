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
import { Plus, Search } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 50;

export default function OrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Lookup maps for names
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [driverMap, setDriverMap] = useState<Record<string, string>>({});
  const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});

  // Load lookup maps once
  useEffect(() => {
    async function loadLookups() {
      const [c, p, d, v] = await Promise.all([
        supabase.from("customers").select("id, name, short_name"),
        supabase.from("products").select("id, name"),
        supabase.from("drivers").select("id, name"),
        supabase.from("vehicles").select("id, plate_number"),
      ]);
      const cm: Record<string, string> = {};
      for (const row of (c.data ?? []) as { id: string; name: string; short_name?: string | null }[]) {
        cm[row.id] = row.short_name || row.name;
      }
      setCustomerMap(cm);
      const pm: Record<string, string> = {};
      for (const row of (p.data ?? []) as { id: string; name: string }[]) pm[row.id] = row.name;
      setProductMap(pm);
      const dm: Record<string, string> = {};
      for (const row of (d.data ?? []) as { id: string; name: string }[]) dm[row.id] = row.name;
      setDriverMap(dm);
      const vm: Record<string, string> = {};
      for (const row of (v.data ?? []) as { id: string; plate_number: string }[]) vm[row.id] = row.plate_number;
      setVehicleMap(vm);
    }
    loadLookups();
  }, [supabase]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select(
        `id, order_date, customer_id, destination, product_id, quantity_liters, unit_price, total_sale, dn_number, invoice_number, status, bukku_sync_status, driver_id, vehicle_id, items:order_items(product_id)`,
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
      className: "max-w-0 w-full",
      mobilePrimary: true,
      render: (o) => (
        <span className="block truncate">
          {customerMap[o.customer_id] ?? "—"}
        </span>
      ),
    },
    {
      key: "product",
      label: "Product",
      className: "whitespace-nowrap",
      mobileVisible: true,
      render: (o) => {
        const items = (o.items ?? []) as unknown as { product_id: string | null }[];
        if (items.length > 1) {
          const firstName = items[0]?.product_id ? productMap[items[0].product_id] : "—";
          return <span title={items.map((i) => i.product_id ? productMap[i.product_id] : "").join(", ")}>{firstName} +{items.length - 1}</span>;
        }
        if (items.length === 1 && items[0]?.product_id) return productMap[items[0].product_id] ?? "—";
        return o.product_id ? productMap[o.product_id] ?? "—" : "—";
      },
    },
    {
      key: "destination",
      label: "Dest.",
      className: "max-w-0 w-full",
      hideClass: "hidden lg:table-cell",
      render: (o) => (
        <span className="block truncate">{o.destination ?? "—"}</span>
      ),
    },
    {
      key: "qty",
      label: "Qty (L)",
      className: "text-right whitespace-nowrap",
      mobileVisible: true,
      render: (o) => (
        <span className="font-mono text-sm">
          {o.quantity_liters?.toLocaleString() ?? "—"}
        </span>
      ),
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
      key: "price",
      label: "Price",
      className: "text-right whitespace-nowrap",
      hideClass: "hidden xl:table-cell",
      render: (o) => o.unit_price ? o.unit_price.toFixed(4) : "—",
    },
    {
      key: "driver",
      label: "Driver",
      className: "whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      render: (o) => o.driver_id ? driverMap[o.driver_id] ?? "—" : "—",
    },
    {
      key: "truck",
      label: "Truck",
      className: "whitespace-nowrap",
      hideClass: "hidden xl:table-cell",
      render: (o) => o.vehicle_id ? vehicleMap[o.vehicle_id] ?? "—" : "—",
    },
    {
      key: "status",
      label: "Status",
      className: "text-center whitespace-nowrap",
      mobileVisible: true,
      render: (o) => <StatusBadge status={o.status} type="order" />,
    },
    {
      key: "bukku",
      label: "Bukku",
      className: "text-center whitespace-nowrap",
      hideClass: "hidden lg:table-cell",
      render: (o) => (
        <StatusBadge
          status={o.bukku_sync_status ?? "pending"}
          type="bukku"
        />
      ),
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
            <SelectItem value="approved" label="Approved">Approved</SelectItem>
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
