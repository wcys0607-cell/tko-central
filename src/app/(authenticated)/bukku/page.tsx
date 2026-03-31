"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Product, Order } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw,
  Search,
  Loader2,
  DollarSign,
  AlertTriangle,
} from "lucide-react";

const PAYMENT_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  unpaid: "bg-orange-100 text-orange-700",
  overdue: "bg-red-100 text-red-700",
};

interface SyncLog {
  id: string;
  type: string;
  message: string;
  status: string;
  sent_at: string;
}

export default function BukkuPage() {
  const supabase = createClient();

  // Contact mapping
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contactFilter, setContactFilter] = useState("all");
  const [contactSearch, setContactSearch] = useState("");

  // Product mapping
  const [products, setProducts] = useState<Product[]>([]);
  const [productFilter, setProductFilter] = useState("all");

  // Invoice sync
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Sync log
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Fetch customers with pagination (Supabase default limit is 1000)
    const allCust: Customer[] = [];
    let custFrom = 0;
    while (true) {
      const { data } = await supabase.from("customers").select("*").eq("is_active", true).order("name").range(custFrom, custFrom + 999);
      const rows = (data ?? []) as Customer[];
      allCust.push(...rows);
      if (rows.length < 1000) break;
      custFrom += 1000;
    }

    const [prodRes, ordRes, logRes] = await Promise.all([
      supabase.from("products").select("*").eq("is_active", true).order("name"),
      supabase
        .from("orders")
        .select("*, customer:customers!orders_customer_id_fkey(id, name)")
        .not("bukku_invoice_id", "is", null)
        .order("order_date", { ascending: false })
        .limit(200),
      supabase
        .from("notifications_log")
        .select("id, type, message, status, sent_at")
        .like("type", "bukku_%")
        .order("sent_at", { ascending: false })
        .limit(50),
    ]);

    setCustomers(allCust);
    if (prodRes.data) setProducts(prodRes.data);
    if (ordRes.data) setOrders(ordRes.data as Order[]);
    if (logRes.data) setSyncLogs(logRes.data as SyncLog[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync(type: "contacts" | "products" | "invoices") {
    setSyncing(type);
    try {
      await fetch(`/api/bukku/sync/${type}`, { method: "POST" });
      await load();
    } catch {
      // handled
    }
    setSyncing(null);
  }

  // Filtered data
  const filteredCustomers = customers.filter((c) => {
    if (contactFilter === "matched" && !c.bukku_contact_id) return false;
    if (contactFilter === "unmatched" && c.bukku_contact_id) return false;
    if (contactSearch && !c.name.toLowerCase().includes(contactSearch.toLowerCase()))
      return false;
    return true;
  });

  const filteredProducts = products.filter((p) => {
    if (productFilter === "matched" && !p.bukku_product_id) return false;
    if (productFilter === "unmatched" && p.bukku_product_id) return false;
    return true;
  });

  const filteredOrders = orders.filter((o) => {
    if (invoiceFilter === "unpaid" && o.bukku_payment_status !== "unpaid") return false;
    if (invoiceFilter === "overdue" && o.bukku_payment_status !== "overdue") return false;
    if (invoiceFilter === "paid" && o.bukku_payment_status !== "paid") return false;
    if (
      invoiceSearch &&
      !o.customer?.name?.toLowerCase().includes(invoiceSearch.toLowerCase()) &&
      !o.invoice_number?.toLowerCase().includes(invoiceSearch.toLowerCase())
    )
      return false;
    return true;
  });

  const totalOutstanding = orders
    .filter((o) => o.bukku_payment_status !== "paid")
    .reduce((s: number, o) => s + (o.total_sale ?? 0), 0);

  const overdueCount = orders.filter((o) => o.bukku_payment_status === "overdue").length;

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading Bukku sync data...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-[#1A3A5C]">Bukku Sync</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Contacts Linked</p>
            <p className="text-lg font-bold text-[#1A3A5C]">
              {customers.filter((c) => c.bukku_contact_id).length}/{customers.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Products Linked</p>
            <p className="text-lg font-bold text-[#1A3A5C]">
              {products.filter((p) => p.bukku_product_id).length}/{products.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-bold text-orange-600">
              <DollarSign className="inline w-4 h-4" />
              RM {totalOutstanding.toFixed(0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-lg font-bold text-red-600">
              <AlertTriangle className="inline w-4 h-4" />
              {overdueCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="contacts">
        <TabsList className="flex-wrap">
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="log">Sync Log</TabsTrigger>
        </TabsList>

        {/* ── Contacts Tab ── */}
        <TabsContent value="contacts" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={contactFilter} onValueChange={(v) => v && setContactFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="unmatched">Unmatched</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search customer..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSync("contacts")}
              disabled={syncing === "contacts"}
            >
              {syncing === "contacts" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Sync Contacts
            </Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Customer Name</th>
                  <th className="text-left p-3">Bukku ID</th>
                  <th className="text-left p-3">TIN</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-6 text-muted-foreground">
                      No customers found
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 font-mono text-xs">
                        {c.bukku_contact_id ?? "—"}
                      </td>
                      <td className="p-3 text-xs">{c.tin_number ?? "—"}</td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={
                            c.bukku_contact_id
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }
                        >
                          {c.bukku_contact_id ? "Linked" : "Unlinked"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Products Tab ── */}
        <TabsContent value="products" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={productFilter} onValueChange={(v) => v && setProductFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="unmatched">Unmatched</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSync("products")}
              disabled={syncing === "products"}
            >
              {syncing === "products" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Sync Products
            </Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Product Name</th>
                  <th className="text-left p-3">Bukku ID</th>
                  <th className="text-left p-3">Classification</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-6 text-muted-foreground">
                      No products found
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 font-mono text-xs">
                        {p.bukku_product_id ?? "—"}
                      </td>
                      <td className="p-3 text-xs">{p.classification_code ?? "—"}</td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={
                            p.bukku_product_id
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }
                        >
                          {p.bukku_product_id ? "Linked" : "Unlinked"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={invoiceFilter} onValueChange={(v) => v && setInvoiceFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search customer or invoice..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSync("invoices")}
              disabled={syncing === "invoices"}
            >
              {syncing === "invoices" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Sync Status
            </Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Invoice #</th>
                  <th className="text-left p-3">Payment</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center p-6 text-muted-foreground">
                      No invoices found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 whitespace-nowrap text-xs">
                        {new Date(o.order_date).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="p-3">{o.customer?.name ?? "—"}</td>
                      <td className="p-3 text-right font-mono">
                        RM {(o.total_sale ?? 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs font-mono">
                        {o.invoice_number ?? "—"}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={PAYMENT_COLORS[o.bukku_payment_status ?? ""] ?? "bg-gray-100 text-gray-600"}
                        >
                          {o.bukku_payment_status ?? "unknown"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Sync Log Tab ── */}
        <TabsContent value="log" className="mt-4">
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Timestamp</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Details</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-6 text-muted-foreground">
                      No sync logs yet
                    </td>
                  </tr>
                ) : (
                  syncLogs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 whitespace-nowrap text-xs">
                        {new Date(log.sent_at).toLocaleString("en-MY")}
                      </td>
                      <td className="p-3 text-xs">
                        {log.type.replace("bukku_", "").replace(/_/g, " ")}
                      </td>
                      <td className="p-3 text-xs max-w-[300px] truncate">
                        {log.message}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={
                            log.status === "sent"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }
                        >
                          {log.status === "sent" ? "Success" : "Failed"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
