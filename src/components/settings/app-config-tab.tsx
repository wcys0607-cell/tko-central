"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Eye, EyeOff } from "lucide-react";

interface ConfigEntry {
  key: string;
  value: string | null;
  description: string | null;
}

const SENSITIVE_KEYWORDS = ["TOKEN", "API", "KEY", "SECRET", "PASSWORD"];

export function AppConfigTab() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const supabase = useMemo(() => createClient(), []);

  async function loadConfigs() {
    setLoadError("");
    const { data, error } = await supabase
      .from("app_config")
      .select("*")
      .order("key");
    if (error) {
      setLoadError(error.message);
    } else if (data) {
      setConfigs(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadConfigs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function isSensitive(key: string) {
    const upper = key.toUpperCase();
    return SENSITIVE_KEYWORDS.some((kw) => upper.includes(kw));
  }

  function toggleReveal(key: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function displayValue(entry: ConfigEntry) {
    if (!entry.value) return "-";
    if (isSensitive(entry.key) && !revealedKeys.has(entry.key)) {
      return "••••••••";
    }
    return entry.value;
  }

  async function handleSave() {
    if (!editingKey) return;
    setSaving(true);
    setSaveError("");
    const { error } = await supabase
      .from("app_config")
      .update({ value: editValue })
      .eq("key", editingKey);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setEditingKey(null);
    loadConfigs();
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading configuration...</p>;
  }

  if (loadError) {
    return (
      <div className="text-sm text-destructive bg-destructive/10 p-4 rounded">
        Failed to load config: {loadError}
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="hidden md:table-cell">
                  Description
                </TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell className="font-mono text-xs">
                    {entry.key}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {displayValue(entry)}
                      </span>
                      {isSensitive(entry.key) && entry.value && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleReveal(entry.key)}
                        >
                          {revealedKeys.has(entry.key) ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {entry.description}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingKey(entry.key);
                        setEditValue(entry.value ?? "");
                        setSaveError("");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!editingKey}
        onOpenChange={(open) => !open && setEditingKey(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Configuration</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {editingKey}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="Enter value"
          />
          {saveError && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{saveError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
