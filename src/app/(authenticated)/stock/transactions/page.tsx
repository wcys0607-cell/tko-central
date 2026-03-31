"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StockTransaction, StockLocation } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Plus, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  purchase: "bg-green-100 text-green-800",
  sale: "bg-red-100 text-red-800",
  transfer: "bg-blue-100 text-blue-800",
  adjustment: "bg-yellow-100 text-yellow-800",
};

const PAGE_SIZE = 50;

export default function TransactionLogPage() {
  const supabase = createClient();
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);

    // Load locations for filter dropdown
    const { data: locs } = await supabase
      .from("stock_locations")
      .select("id, code, name")
      .order("code");
    if (locs) setLocations(locs);

    // Build query
    let query = supabase
      .from("stock_transactions")
      .select(
        "*, source_location:stock_locations!stock_transactions_source_location_id_fkey(id, code, name), dest_location:stock_locations!stock_transactions_dest_location_id_fkey(id, code, name)",
        { count: "exact" }
      )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (typeFilter !== "all") query = query.eq("type", typeFilter);
    if (ownerFilter !== "all") query = query.eq("owner", ownerFilter);
    if (dateFrom) query = query.gte("transaction_date", `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte("transaction_date", `${dateTo}T23:59:59`);
    if (locationFilter !== "all") {
      query = query.or(
        `source_location_id.eq.${locationFilter},dest_location_id.eq.${locationFilter}`
      );
    }

    const { data, count } = await query;
    if (data) setTransactions(data);
    setTotal(count ?? 0);
    setLoading(false);
  }, [supabase, page, typeFilter, locationFilter, ownerFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [typeFilter, locationFilter, ownerFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/stock">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">
            Transaction Log
          </h1>
        </div>
        <Link href="/stock/transactions/new">
          <Button size="sm" className="bg-[#1A3A5C] hover:bg-[#15304D]">
            <Plus className="w-4 h-4 mr-1" /> New Entry
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
            />
            <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={(v) => v && setLocationFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name || l.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={(v) => v && setOwnerFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                <SelectItem value="Company">Company</SelectItem>
                <SelectItem value="Partner">Partner</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Destination</th>
              <th className="text-right p-3">Qty (L)</th>
              <th className="text-right p-3">Price/L</th>
              <th className="text-left p-3">Customer</th>
              <th className="text-left p-3">Reference</th>
              <th className="text-left p-3">Owner</th>
              <th className="text-right p-3">Run. Qty</th>
              <th className="text-right p-3">Run. Avg</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="text-center p-6 text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center p-6 text-muted-foreground">
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 whitespace-nowrap">
                    {new Date(tx.transaction_date).toLocaleDateString("en-MY")}
                  </td>
                  <td className="p-3">
                    <Badge
                      className={`${TYPE_COLORS[tx.type] || ""} capitalize`}
                      variant="secondary"
                    >
                      {tx.type}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {tx.source_location?.name || tx.source_location?.code || "—"}
                  </td>
                  <td className="p-3">
                    {tx.dest_location?.name || tx.dest_location?.code || "—"}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {tx.quantity_liters?.toLocaleString() ?? "—"}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {tx.price_per_liter != null
                      ? `RM ${tx.price_per_liter.toFixed(4)}`
                      : "—"}
                  </td>
                  <td className="p-3 max-w-[150px] truncate">
                    {tx.customer_name || "—"}
                  </td>
                  <td className="p-3">{tx.reference || "—"}</td>
                  <td className="p-3">{tx.owner || "—"}</td>
                  <td className="p-3 text-right font-mono text-xs">
                    {tx.running_total_qty?.toLocaleString() ?? "—"}
                  </td>
                  <td className="p-3 text-right font-mono text-xs">
                    {tx.running_avg_cost != null
                      ? `RM ${tx.running_avg_cost.toFixed(4)}`
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
