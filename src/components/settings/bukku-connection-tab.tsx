"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Check, X, Loader2, Trash2, HardDrive } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SyncStatus {
  contacts: { lastSync: string | null; loading: boolean };
  products: { lastSync: string | null; loading: boolean };
  invoices: { lastSync: string | null; loading: boolean };
}

export function BukkuConnectionTab() {
  const supabase = useMemo(() => createClient(), []);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "ok" | "failed">("unknown");
  const [statusMessage, setStatusMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    contacts: { lastSync: null, loading: false },
    products: { lastSync: null, loading: false },
    invoices: { lastSync: null, loading: false },
  });
  const [storageStats, setStorageStats] = useState<{ fileCount: number; totalSize: number } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleanupDays, setCleanupDays] = useState("90");
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");

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

    // Load last sync timestamps from notifications_log
    const { data: logs } = await supabase
      .from("notifications_log")
      .select("type, sent_at")
      .in("type", ["bukku_sync_contacts", "bukku_sync_products", "bukku_sync_invoices"])
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(3);

    const newSync = { ...syncStatus };
    for (const log of logs ?? []) {
      if (log.type === "bukku_sync_contacts" && !newSync.contacts.lastSync) {
        newSync.contacts.lastSync = log.sent_at;
      }
      if (log.type === "bukku_sync_products" && !newSync.products.lastSync) {
        newSync.products.lastSync = log.sent_at;
      }
      if (log.type === "bukku_sync_invoices" && !newSync.invoices.lastSync) {
        newSync.invoices.lastSync = log.sent_at;
      }
    }
    setSyncStatus(newSync);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    setSaving(true);
    for (const [key, value] of [
      ["BUKKU_BASE_URL", baseUrl],
      ["BUKKU_API_TOKEN", token],
      ["BUKKU_SUBDOMAIN", subdomain],
    ]) {
      await supabase
        .from("app_config")
        .update({ value })
        .eq("key", key);
    }
    setSaving(false);
    setConnectionStatus("unknown");
  }

  async function handleTest() {
    setTesting(true);
    setConnectionStatus("unknown");
    setStatusMessage("");

    try {
      const res = await fetch("/api/bukku/test", { method: "POST" });
      const json = await res.json();

      if (json.ok) {
        setConnectionStatus("ok");
        setStatusMessage("Connected successfully");
      } else {
        setConnectionStatus("failed");
        setStatusMessage(json.error || "Connection failed");
      }
    } catch {
      setConnectionStatus("failed");
      setStatusMessage("Network error");
    }
    setTesting(false);
  }

  async function handleSync(type: "contacts" | "products" | "invoices") {
    setSyncStatus((prev) => ({
      ...prev,
      [type]: { ...prev[type], loading: true },
    }));

    try {
      const res = await fetch(`/api/bukku/sync/${type}`, { method: "POST" });
      const json = await res.json();

      setSyncStatus((prev) => ({
        ...prev,
        [type]: {
          lastSync: new Date().toISOString(),
          loading: false,
        },
      }));

      setStatusMessage(
        `${type}: ${json.matched ?? 0} matched, ${json.created ?? 0} created` +
          (json.failed ? `, ${json.failed} failed` : "")
      );
    } catch {
      setSyncStatus((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: false },
      }));
      setStatusMessage(`${type} sync failed`);
    }
  }

  function formatLastSync(ts: string | null) {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString("en-MY");
  }

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

  useEffect(() => {
    loadStorageStats();
  }, [loadStorageStats]);

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

  return (
    <div className="space-y-4">
      {/* Connection Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bukku API Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Base URL</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.bukku.my"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Company Subdomain</label>
            <Input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="topkimoil"
            />
            <p className="text-xs text-muted-foreground">Your Bukku subdomain (e.g. &quot;topkimoil&quot; from topkimoil.bukku.my)</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">API Token</label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter Bukku API token"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Test Connection
            </Button>
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
          </div>
          {statusMessage && (
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          )}
        </CardContent>
      </Card>

      {/* Sync Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sync Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(
              [
                { key: "contacts", label: "Contacts" },
                { key: "products", label: "Products" },
                { key: "invoices", label: "Invoice Status" },
              ] as const
            ).map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    Last sync: {formatLastSync(syncStatus[key].lastSync)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync(key)}
                  disabled={syncStatus[key].loading}
                >
                  {syncStatus[key].loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1" /> Sync Now
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Document Storage */}
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
                  <SelectValue />
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
    </div>
  );
}
