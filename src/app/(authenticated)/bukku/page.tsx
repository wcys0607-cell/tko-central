"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
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
  Settings,
  ChevronDown,
  Check,
  X,
  Trash2,
  HardDrive,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

interface SyncLog {
  id: string;
  type: string;
  message: string;
  status: string;
  sent_at: string;
}

export default function BukkuPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role } = useAuth();
  const isAdmin = role === "admin";

  // Config state
  const [configOpen, setConfigOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "ok" | "failed">("unknown");

  // Storage state
  const [storageStats, setStorageStats] = useState<{ fileCount: number; totalSize: number } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleanupDays, setCleanupDays] = useState("90");
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");

  // Contact mapping
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contactFilter, setContactFilter] = useState("all");
  const [contactSearch, setContactSearch] = useState("");

  // Product mapping
  const [products, setProducts] = useState<Product[]>([]);
  const [productFilter, setProductFilter] = useState("all");

  // Chain tracker (invoices)
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Sync log
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["BUKKU_BASE_URL", "BUKKU_API_TOKEN", "BUKKU_SUBDOMAIN"]);

    for (const row of data ?? []) {
      if (row.key === "BUKKU_BASE_URL") setBaseUrl(row.value ?? "");
      if (row.key === "BUKKU_API_TOKEN") setToken(row.value ?? "");
      if (row.key === "BUKKU_SUBDOMAIN") setSubdomain(row.value ?? "");
    }
  }, [supabase]);

  const loadStorageStats = useCallback(async () => {
    setStorageLoading(true);
    try {
      const res = await fetch("/api/bukku/storage");
      const data = await res.json();
      setStorageStats(data);
    } catch {
      setStorageStats(null);
    }
    setStorageLoading(false);
  }, []);

  const load = useCallback(async () => {
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
        .not("bukku_so_id", "is", null)
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
    if (isAdmin) {
      loadConfig();
      loadStorageStats();
    }
  }, [load, loadConfig, loadStorageStats, isAdmin]);

  async function handleSave() {
    setSaving(true);
    for (const [key, value] of [
      ["BUKKU_BASE_URL", baseUrl],
      ["BUKKU_API_TOKEN", token],
      ["BUKKU_SUBDOMAIN", subdomain],
    ]) {
      await supabase.from("app_config").update({ value }).eq("key", key);
    }
    setSaving(false);
    setConnectionStatus("unknown");
    setStatusMessage("Saved");
  }

  async function handleTest() {
    setTesting(true);
    setConnectionStatus("unknown");
    try {
      const res = await fetch("/api/bukku/test", { method: "POST" });
      const json = await res.json();
      setConnectionStatus(json.ok ? "ok" : "failed");
    } catch {
      setConnectionStatus("failed");
    }
    setTesting(false);
  }

  async function handleSync(type: "contacts" | "products" | "invoices") {
    setSyncing(type);
    setStatusMessage("");
    try {
      const res = await fetch(`/api/bukku/sync/${type}`, { method: "POST" });
      const json = await res.json();
      if (type === "invoices") {
        setStatusMessage(
          `Chain sync: ${json.linked_dn ?? 0} DN linked, ${json.linked_inv ?? 0} INV linked, ${json.updated ?? 0} payment updated` +
            (json.overdue ? `, ${json.overdue} overdue` : "") +
            (json.failed ? `, ${json.failed} failed` : "")
        );
      } else {
        let msg = `${type}: ${json.matched ?? 0} matched, ${json.created ?? 0} created` +
            (json.failed ? `, ${json.failed} failed` : "");
        if (json.errors?.length) {
          msg += ` — ${json.errors.slice(0, 3).join("; ")}`;
        }
        setStatusMessage(msg);
      }
      await load();
    } catch {
      setStatusMessage(`${type} sync failed`);
    }
    setSyncing(null);
  }

  async function handleCleanup() {
    if (!confirm(`Delete all Bukku PDFs older than ${cleanupDays} days?`)) return;
    setCleanupLoading(true);
    setCleanupMessage("");
    try {
      const res = await fetch("/api/bukku/storage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: parseInt(cleanupDays) }),
      });
      const data = await res.json();
      if (res.ok) {
        setCleanupMessage(`Deleted ${data.deleted} file(s)`);
        loadStorageStats();
      } else {
        setCleanupMessage(data.error || "Cleanup failed");
      }
    } catch {
      setCleanupMessage("Network error");
    }
    setCleanupLoading(false);
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    if (invoiceFilter === "pending" && (o.bukku_do_number || o.bukku_invoice_number)) return false;
    if (
      invoiceSearch &&
      !o.customer?.name?.toLowerCase().includes(invoiceSearch.toLowerCase()) &&
      !o.invoice_number?.toLowerCase().includes(invoiceSearch.toLowerCase()) &&
      !o.bukku_so_number?.toLowerCase().includes(invoiceSearch.toLowerCase())
    )
      return false;
    return true;
  });

  const totalOutstanding = orders
    .filter((o) => o.bukku_payment_status && o.bukku_payment_status !== "paid")
    .reduce((s: number, o) => s + (o.total_sale ?? 0), 0);

  const overdueCount = orders.filter((o) => o.bukku_payment_status === "overdue").length;

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading Bukku data...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-primary">Bukku Sync</h1>
      </div>

      {/* Admin: API Config (collapsible) */}
      {isAdmin && (
        <Card>
          <CardHeader
            className="cursor-pointer pb-3 hover:bg-muted/50 transition-colors"
            onClick={() => setConfigOpen(!configOpen)}
          >
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                API Configuration
              </span>
              <div className="flex items-center gap-2">
                {connectionStatus === "ok" && (
                  <Badge className="bg-status-approved-bg text-status-approved-fg">
                    <Check className="w-3 h-3 mr-1" /> Connected
                  </Badge>
                )}
                {connectionStatus === "failed" && (
                  <Badge className="bg-destructive/10 text-destructive">
                    <X className="w-3 h-3 mr-1" /> Failed
                  </Badge>
                )}
                <ChevronDown className={`h-4 w-4 transition-transform ${configOpen ? "rotate-180" : ""}`} />
              </div>
            </CardTitle>
          </CardHeader>
          {configOpen && (
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Base URL</label>
                  <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.bukku.my" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Subdomain</label>
                  <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="topkimoil" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">API Token</label>
                  <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Test Connection
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Contacts Linked</p>
            <p className="text-lg font-bold text-primary">
              {customers.filter((c) => c.bukku_contact_id).length}/{customers.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Products Linked</p>
            <p className="text-lg font-bold text-primary">
              {products.filter((p) => p.bukku_product_id).length}/{products.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-bold text-accent-foreground">
              <DollarSign className="inline w-4 h-4" />
              RM {totalOutstanding.toFixed(0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-lg font-bold text-destructive">
              <AlertTriangle className="inline w-4 h-4" />
              {overdueCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {statusMessage && (
        <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">{statusMessage}</p>
      )}

      <Tabs defaultValue="chain">
        <TabsList className="flex-wrap">
          <TabsTrigger value="chain">Chain Tracker</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          {isAdmin && <TabsTrigger value="storage">Storage</TabsTrigger>}
          <TabsTrigger value="log">Sync Log</TabsTrigger>
        </TabsList>

        {/* ── Chain Tracker Tab (SO → DN → INV → Payment) ── */}
        <TabsContent value="chain" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={invoiceFilter} onValueChange={(v) => v && setInvoiceFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>{{ all: "All", pending: "Pending DN/INV", unpaid: "Unpaid", overdue: "Overdue", paid: "Paid" }[invoiceFilter] ?? invoiceFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label="All">All</SelectItem>
                <SelectItem value="pending" label="Pending DN/INV">Pending DN/INV</SelectItem>
                <SelectItem value="unpaid" label="Unpaid">Unpaid</SelectItem>
                <SelectItem value="overdue" label="Overdue">Overdue</SelectItem>
                <SelectItem value="paid" label="Paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search customer, SO, or invoice..."
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
              Sync Chain
            </Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">SO #</th>
                  <th className="text-left p-3">DN #</th>
                  <th className="text-left p-3">Invoice #</th>
                  <th className="text-left p-3">Payment</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-6 text-muted-foreground">
                      No orders with Bukku SO found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="border-b hover:bg-muted">
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
                        {o.bukku_so_number ?? "—"}
                      </td>
                      <td className="p-3 text-xs font-mono">
                        {o.bukku_do_number ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-xs font-mono">
                        {o.bukku_invoice_number ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3">
                        {o.bukku_payment_status ? (
                          <StatusBadge status={o.bukku_payment_status} type="payment" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Contacts Tab ── */}
        <TabsContent value="contacts" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={contactFilter} onValueChange={(v) => v && setContactFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>{{ all: "All", matched: "Matched", unmatched: "Unmatched" }[contactFilter] ?? contactFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label="All">All</SelectItem>
                <SelectItem value="matched" label="Matched">Matched</SelectItem>
                <SelectItem value="unmatched" label="Unmatched">Unmatched</SelectItem>
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
              <thead className="bg-muted border-b">
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
                    <tr key={c.id} className="border-b hover:bg-muted">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 font-mono text-xs">{c.bukku_contact_id ?? "—"}</td>
                      <td className="p-3 text-xs">{c.tin_number ?? "—"}</td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={
                            c.bukku_contact_id
                              ? "bg-status-approved-bg text-status-approved-fg"
                              : "bg-muted text-muted-foreground"
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
                <SelectValue>{{ all: "All", matched: "Matched", unmatched: "Unmatched" }[productFilter] ?? productFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label="All">All</SelectItem>
                <SelectItem value="matched" label="Matched">Matched</SelectItem>
                <SelectItem value="unmatched" label="Unmatched">Unmatched</SelectItem>
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
              <thead className="bg-muted border-b">
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
                    <tr key={p.id} className="border-b hover:bg-muted">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 font-mono text-xs">{p.bukku_product_id ?? "—"}</td>
                      <td className="p-3 text-xs">{p.classification_code ?? "—"}</td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={
                            p.bukku_product_id
                              ? "bg-status-approved-bg text-status-approved-fg"
                              : "bg-muted text-muted-foreground"
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

        {/* ── Storage Tab (admin only) ── */}
        {isAdmin && (
          <TabsContent value="storage" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Document Storage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Bukku SO PDFs</p>
                    <p className="text-xs text-muted-foreground">
                      {storageLoading
                        ? "Loading..."
                        : storageStats
                          ? `${storageStats.fileCount} file(s) · ${formatBytes(storageStats.totalSize)}`
                          : "Unable to load"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadStorageStats} disabled={storageLoading}>
                    {storageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Cleanup</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Delete PDFs older than</span>
                    <Select value={cleanupDays} onValueChange={(v) => v && setCleanupDays(v)}>
                      <SelectTrigger className="w-[100px] h-8 text-sm">
                        <SelectValue>{{ "30": "30 days", "60": "60 days", "90": "90 days", "180": "180 days", "365": "1 year" }[cleanupDays] ?? cleanupDays}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30" label="30 days">30 days</SelectItem>
                        <SelectItem value="60" label="60 days">60 days</SelectItem>
                        <SelectItem value="90" label="90 days">90 days</SelectItem>
                        <SelectItem value="180" label="180 days">180 days</SelectItem>
                        <SelectItem value="365" label="1 year">1 year</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCleanup}
                      disabled={cleanupLoading}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {cleanupLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-1" /> Clean Up
                        </>
                      )}
                    </Button>
                  </div>
                  {cleanupMessage && (
                    <p className="text-sm text-muted-foreground mt-2">{cleanupMessage}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Sync Log Tab ── */}
        <TabsContent value="log" className="mt-4">
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
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
                    <tr key={log.id} className="border-b hover:bg-muted">
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
                              ? "bg-status-approved-bg text-status-approved-fg"
                              : "bg-destructive/10 text-destructive"
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
