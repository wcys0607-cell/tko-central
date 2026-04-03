"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Bell, Wrench, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Recipient {
  name: string;
  phone: string;
  logic?: "all" | "custom";
  doc_types?: string[];
}

interface RecipientGroup {
  configKey: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  supportsDocTypes: boolean;
  docTypeOptions?: string[];
  recipients: Recipient[];
}

const DOC_TYPE_OPTIONS = ["Road Tax", "Insurance", "Puspakom", "SPAD Permit", "Grant"];

const GROUP_DEFS: Omit<RecipientGroup, "recipients">[] = [
  {
    configKey: "FLEET_EXPIRY_RECIPIENTS",
    label: "Fleet Document Expiry Alerts",
    description: "Receive WhatsApp when documents are expiring (30 days, 7 days, expired)",
    icon: <Bell className="w-4 h-4 text-destructive" />,
    supportsDocTypes: true,
    docTypeOptions: DOC_TYPE_OPTIONS,
  },
  {
    configKey: "FLEET_UPDATE_RECIPIENTS",
    label: "Fleet Document Update Notifications",
    description: "Receive WhatsApp when a document is renewed/updated",
    icon: <RefreshCw className="w-4 h-4 text-primary" />,
    supportsDocTypes: true,
    docTypeOptions: DOC_TYPE_OPTIONS,
  },
  {
    configKey: "MAINTENANCE_ALERT_RECIPIENTS",
    label: "Maintenance & Defect Alerts",
    description: "Receive WhatsApp for maintenance due and vehicle defects",
    icon: <Wrench className="w-4 h-4 text-status-pending-fg" />,
    supportsDocTypes: false,
  },
];

export function NotificationRecipientsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroupKey, setEditGroupKey] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formLogic, setFormLogic] = useState<"all" | "custom">("all");
  const [formDocTypes, setFormDocTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const keys = GROUP_DEFS.map((g) => g.configKey);
    const { data } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", keys);

    const configMap = new Map<string, string>();
    for (const row of data ?? []) {
      configMap.set(row.key, row.value ?? "[]");
    }

    setGroups(
      GROUP_DEFS.map((def) => {
        let recipients: Recipient[] = [];
        try {
          recipients = JSON.parse(configMap.get(def.configKey) ?? "[]");
        } catch {
          recipients = [];
        }
        return { ...def, recipients };
      })
    );
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd(groupKey: string) {
    const group = groups.find((g) => g.configKey === groupKey);
    setEditGroupKey(groupKey);
    setEditIndex(null);
    setFormName("");
    setFormPhone("");
    setFormLogic(group?.supportsDocTypes ? "all" : "all");
    setFormDocTypes([]);
    setDialogOpen(true);
  }

  function openEdit(groupKey: string, index: number) {
    const group = groups.find((g) => g.configKey === groupKey);
    const r = group?.recipients[index];
    if (!r) return;
    setEditGroupKey(groupKey);
    setEditIndex(index);
    setFormName(r.name);
    setFormPhone(r.phone);
    setFormLogic(r.logic ?? "all");
    setFormDocTypes(r.doc_types ?? []);
    setDialogOpen(true);
  }

  async function saveRecipients(groupKey: string, recipients: Recipient[]) {
    const { error } = await supabase
      .from("app_config")
      .update({ value: JSON.stringify(recipients) })
      .eq("key", groupKey);
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!formName.trim() || !formPhone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    if (!editGroupKey) return;

    setSaving(true);
    const group = groups.find((g) => g.configKey === editGroupKey);
    if (!group) { setSaving(false); return; }

    const newRecipient: Recipient = {
      name: formName.trim(),
      phone: formPhone.trim().replace(/[^0-9]/g, ""),
    };

    if (group.supportsDocTypes) {
      newRecipient.logic = formLogic;
      if (formLogic === "custom") {
        newRecipient.doc_types = formDocTypes;
      }
    }

    const updated = [...group.recipients];
    if (editIndex != null) {
      updated[editIndex] = newRecipient;
    } else {
      updated.push(newRecipient);
    }

    const ok = await saveRecipients(editGroupKey, updated);
    setSaving(false);
    if (ok) {
      toast.success(editIndex != null ? "Recipient updated" : "Recipient added");
      setDialogOpen(false);
      loadAll();
    }
  }

  async function handleDelete(groupKey: string, index: number) {
    const group = groups.find((g) => g.configKey === groupKey);
    if (!group) return;
    const updated = group.recipients.filter((_, i) => i !== index);
    const ok = await saveRecipients(groupKey, updated);
    if (ok) {
      toast.success("Recipient removed");
      loadAll();
    }
  }

  function toggleDocType(dt: string) {
    setFormDocTypes((prev) =>
      prev.includes(dt) ? prev.filter((d) => d !== dt) : [...prev, dt]
    );
  }

  const currentGroup = groups.find((g) => g.configKey === editGroupKey);

  if (loading) {
    return <p className="text-muted-foreground">Loading notification settings...</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Card key={group.configKey}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {group.icon}
                <div>
                  <CardTitle className="text-base">{group.label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {group.description}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => openAdd(group.configKey)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {group.recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recipients configured
              </p>
            ) : (
              <div className="space-y-2">
                {group.recipients.map((r, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{r.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          +{r.phone}
                        </div>
                      </div>
                      {group.supportsDocTypes && (
                        <div className="flex flex-wrap gap-1">
                          {!r.logic || r.logic === "all" ? (
                            <Badge variant="secondary" className="text-[10px]">
                              All types
                            </Badge>
                          ) : (
                            (r.doc_types ?? []).map((dt) => (
                              <Badge key={dt} variant="outline" className="text-[10px]">
                                {dt}
                              </Badge>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(group.configKey, idx)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(group.configKey, idx)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editIndex != null ? "Edit Recipient" : "Add Recipient"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Wilson"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. 60175502007"
                />
                <p className="text-[10px] text-muted-foreground">
                  Country code without + (e.g. 601...)
                </p>
              </div>
            </div>

            {currentGroup?.supportsDocTypes && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Document Types</label>
                <Select
                  value={formLogic}
                  onValueChange={(v) => {
                    if (v === "all" || v === "custom") setFormLogic(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" label="All document types">
                      All document types
                    </SelectItem>
                    <SelectItem value="custom" label="Specific types only">
                      Specific types only
                    </SelectItem>
                  </SelectContent>
                </Select>

                {formLogic === "custom" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(currentGroup.docTypeOptions ?? []).map((dt) => {
                      const selected = formDocTypes.includes(dt);
                      return (
                        <Badge
                          key={dt}
                          variant={selected ? "default" : "outline"}
                          className={`cursor-pointer text-xs ${
                            selected
                              ? "bg-primary hover:bg-primary/90"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => toggleDocType(dt)}
                        >
                          {dt}
                        </Badge>
                      );
                    })}
                    {formDocTypes.length === 0 && (
                      <p className="text-xs text-destructive">
                        Select at least one type
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || (formLogic === "custom" && formDocTypes.length === 0)}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
