"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 50;

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

export default function OrdersPage() {
  const supabase = createClient();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select(
        `*, customer:customer_id(id,name,short_name), product:product_id(id,name,unit), driver:driver_id(id,name), vehicle:vehicle_id(id,plate_number)`,
        { count: "exact" }
      )
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (dateFrom) query = query.gte("order_date", dateFrom);
    if (dateTo) query = query.lte("order_date", dateTo);
    if (search.trim()) {
      // Sanitize search to prevent PostgREST filter injection
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Orders</h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} total orders</p>
        </div>
        <Button
          onClick={() => router.push("/orders/new")}
          className="bg-[#1A3A5C] hover:bg-[#15304D] gap-2"
        >
          <Plus className="h-4 w-4" />
          New Order
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Invoice / DN number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 w-52"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { if (v) { setStatusFilter(v); setPage(0); } }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="w-36"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="w-36"
          />
        </div>
        {(statusFilter !== "all" || dateFrom || dateTo || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); setSearch(""); setPage(0); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-[80px]">Date</TableHead>
              <TableHead className="min-w-[120px]">Customer</TableHead>
              <TableHead className="min-w-[100px]">Destination</TableHead>
              <TableHead className="text-right w-[70px]">Qty (L)</TableHead>
              <TableHead className="text-right w-[70px]">Price</TableHead>
              <TableHead className="text-right w-[80px]">Total</TableHead>
              <TableHead className="w-[80px]">Driver</TableHead>
              <TableHead className="w-[70px]">Truck</TableHead>
              <TableHead className="text-center w-[75px]">Status</TableHead>
              <TableHead className="text-center w-[65px]">Bukku</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow
                  key={o.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/orders/${o.id}`)}
                >
                  <TableCell className="text-sm font-medium whitespace-nowrap">
                    {o.order_date ? format(new Date(o.order_date + "T00:00:00"), "d MMM yy") : "—"}
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <div className="text-sm font-medium truncate">
                      {(o.customer as { short_name?: string | null } | null)?.short_name ||
                       ((o.customer as { name: string } | null)?.name ?? "—")}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm max-w-[120px] truncate">{o.destination ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">
                    {o.quantity_liters?.toLocaleString() ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {o.unit_price ? o.unit_price.toFixed(4) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {o.total_sale
                      ? o.total_sale.toLocaleString("en-MY", { minimumFractionDigits: 2 })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(o.driver as { name: string } | null)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(o.vehicle as { plate_number: string } | null)?.plate_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className={STATUS_COLORS[o.status] ?? ""}>
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="secondary"
                      className={BUKKU_COLORS[o.bukku_sync_status ?? "pending"] ?? ""}
                    >
                      {o.bukku_sync_status ?? "pending"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">Page {page + 1} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
