"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Check, X, Loader2 } from "lucide-react";

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
              className="bg-[#1A3A5C] hover:bg-[#15304D]"
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
              <Badge className="bg-green-100 text-green-700">
                <Check className="w-3 h-3 mr-1" /> Connected
              </Badge>
            )}
            {connectionStatus === "failed" && (
              <Badge className="bg-red-100 text-red-700">
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
    </div>
  );
}
