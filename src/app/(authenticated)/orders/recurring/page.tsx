"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RecurringRule, Customer } from "@/lib/types";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, ArrowLeft, ToggleLeft, ToggleRight } from "lucide-react";
import { useRouter } from "next/navigation";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const EMPTY_FORM = {
  customer_id: "",
  destination: "",
  quantity_liters: "",
  remark: "",
  trigger_day: "Monday",
  day_offset: "0",
};

export default function RecurringRulesPage() {
  const supabase = createClient();
  const router = useRouter();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const [r, c] = await Promise.all([
      supabase.from("recurring_rules").select("*, customer:customer_id(id,name)").order("trigger_day"),
      supabase.from("customers").select("id,name").eq("is_active", true).order("name"),
    ]);
    setRules((r.data as RecurringRule[]) ?? []);
    setCustomers((c.data as Customer[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(rule: RecurringRule) {
    setEditing(rule);
    setForm({
      customer_id: rule.customer_id,
      destination: rule.destination ?? "",
      quantity_liters: rule.quantity_liters?.toString() ?? "",
      remark: rule.remark ?? "",
      trigger_day: rule.trigger_day,
      day_offset: rule.day_offset.toString(),
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.customer_id) { setError("Customer is required."); return; }
    setSaving(true);
    setError("");

    const payload = {
      customer_id: form.customer_id,
      destination: form.destination.trim() || null,
      quantity_liters: form.quantity_liters ? parseFloat(form.quantity_liters) : null,
      remark: form.remark.trim() || null,
      trigger_day: form.trigger_day,
      day_offset: parseInt(form.day_offset) || 0,
    };

    let err;
    if (editing) {
      ({ error: err } = await supabase.from("recurring_rules").update(payload).eq("id", editing.id));
    } else {
      ({ error: err } = await supabase.from("recurring_rules").insert({ ...payload, is_active: true }));
    }

    if (err) {
      setError(err.message);
    } else {
      setDialogOpen(false);
      fetchRules();
    }
    setSaving(false);
  }

  async function handleDelete(rule: RecurringRule) {
    if (!confirm(`Delete rule for ${(rule.customer as { name: string } | null)?.name}?`)) return;
    await supabase.from("recurring_rules").delete().eq("id", rule.id);
    fetchRules();
  }

  async function toggleActive(rule: RecurringRule) {
    await supabase.from("recurring_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    fetchRules();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Recurring Rules</h1>
          <p className="text-sm text-muted-foreground">Auto-generate orders on a weekly schedule</p>
        </div>
        <Button onClick={openNew} className="bg-[#1A3A5C] hover:bg-[#15304D] gap-2">
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Customer</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead className="text-right">Qty (L)</TableHead>
              <TableHead className="text-center">Trigger Day</TableHead>
              <TableHead className="text-center">Delivery Offset</TableHead>
              <TableHead>Remark</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No recurring rules yet.</TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-sm">
                    {(rule.customer as { name: string } | null)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{rule.destination ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">{rule.quantity_liters?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {rule.trigger_day}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {rule.day_offset === 0 ? "Same day" : `+${rule.day_offset} day${rule.day_offset > 1 ? "s" : ""}`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{rule.remark ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" onClick={() => toggleActive(rule)}>
                      {rule.is_active
                        ? <ToggleRight className="h-4 w-4 text-green-600" />
                        : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(rule)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Rule" : "Add Recurring Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Customer *</label>
              <Select
                value={form.customer_id || "_none"}
                onValueChange={(v) => v && setForm({ ...form, customer_id: v === "_none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Destination</label>
              <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Quantity (L)</label>
              <Input type="number" value={form.quantity_liters} onChange={(e) => setForm({ ...form, quantity_liters: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Trigger Day</label>
                <Select value={form.trigger_day} onValueChange={(v) => v && setForm({ ...form, trigger_day: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Delivery Offset (days)</label>
                <Input type="number" min="0" value={form.day_offset} onChange={(e) => setForm({ ...form, day_offset: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Remark</label>
              <Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#1A3A5C] hover:bg-[#15304D]">
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
