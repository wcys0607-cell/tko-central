"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RecurringRule, Customer, Product } from "@/lib/types";
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
import { toast } from "sonner";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface RuleFormItem {
  product_id: string;
  quantity_liters: string;
}

const EMPTY_FORM = {
  customer_id: "",
  destination: "",
  remark: "",
  trigger_day: "Monday",
  day_offset: "0",
};

export default function RecurringRulesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formItems, setFormItems] = useState<RuleFormItem[]>([{ product_id: "", quantity_liters: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data: rulesData } = await supabase
      .from("recurring_rules")
      .select("*, customer:customer_id(id,name)")
      .order("trigger_day");

    // Load items for each rule
    const rulesList = (rulesData as RecurringRule[]) ?? [];
    if (rulesList.length > 0) {
      const ruleIds = rulesList.map((r) => r.id);
      const { data: itemsData } = await supabase
        .from("recurring_rule_items")
        .select("*, product:product_id(id,name)")
        .in("rule_id", ruleIds)
        .order("sort_order");
      // Attach items to rules
      for (const rule of rulesList) {
        rule.items = (itemsData ?? []).filter((i: { rule_id: string }) => i.rule_id === rule.id);
      }
    }
    setRules(rulesList);

    const allCust: Customer[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase.from("customers").select("id,name").eq("is_active", true).order("name").range(from, from + 999);
      const rows = (data ?? []) as Customer[];
      allCust.push(...rows);
      if (rows.length < 1000) break;
      from += 1000;
    }
    setCustomers(allCust);

    const { data: prodData } = await supabase.from("products").select("id,name").eq("is_active", true).order("name");
    setProducts((prodData as Product[]) ?? []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormItems([{ product_id: "", quantity_liters: "" }]);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(rule: RecurringRule) {
    setEditing(rule);
    setForm({
      customer_id: rule.customer_id,
      destination: rule.destination ?? "",
      remark: rule.remark ?? "",
      trigger_day: rule.trigger_day,
      day_offset: rule.day_offset.toString(),
    });
    const ruleItems = rule.items ?? [];
    setFormItems(
      ruleItems.length > 0
        ? ruleItems.map((i) => ({ product_id: i.product_id ?? "", quantity_liters: i.quantity_liters?.toString() ?? "" }))
        : [{ product_id: "", quantity_liters: rule.quantity_liters?.toString() ?? "" }]
    );
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.customer_id) { setError("Customer is required."); return; }
    setSaving(true);
    setError("");

    const totalQty = formItems.reduce((s, i) => s + (parseFloat(i.quantity_liters) || 0), 0);

    const payload = {
      customer_id: form.customer_id,
      destination: form.destination.trim() || null,
      quantity_liters: totalQty || null,
      remark: form.remark.trim() || null,
      trigger_day: form.trigger_day,
      day_offset: parseInt(form.day_offset) || 0,
    };

    let ruleId = editing?.id;
    let err;

    if (editing) {
      ({ error: err } = await supabase.from("recurring_rules").update(payload).eq("id", editing.id));
    } else {
      const { data, error: insertErr } = await supabase
        .from("recurring_rules")
        .insert({ ...payload, is_active: true })
        .select("id")
        .single();
      err = insertErr;
      ruleId = data?.id;
    }

    if (err) { setError(err.message); setSaving(false); return; }

    // Save rule items
    if (ruleId) {
      await supabase.from("recurring_rule_items").delete().eq("rule_id", ruleId);
      const validItems = formItems.filter((i) => i.product_id || parseFloat(i.quantity_liters) > 0);
      if (validItems.length > 0) {
        await supabase.from("recurring_rule_items").insert(
          validItems.map((i, idx) => ({
            rule_id: ruleId,
            product_id: i.product_id || null,
            quantity_liters: parseFloat(i.quantity_liters) || 0,
            sort_order: idx,
          }))
        );
      }
    }

    setDialogOpen(false);
    toast.success(editing ? "Rule updated" : "Rule added");
    fetchRules();
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
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Recurring Rules</h1>
          <p className="text-sm text-muted-foreground">Auto-generate orders on a weekly schedule</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="max-w-0 w-full">Customer</TableHead>
              <TableHead className="whitespace-nowrap">Items</TableHead>
              <TableHead className="text-center whitespace-nowrap">Day</TableHead>
              <TableHead className="text-center whitespace-nowrap">Offset</TableHead>
              <TableHead className="text-center whitespace-nowrap">Active</TableHead>
              <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No recurring rules yet.</TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => {
                const ruleItems = rule.items ?? [];
                return (
                  <TableRow key={rule.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="font-medium text-sm truncate">{(rule.customer as { name: string } | null)?.name ?? "—"}</div>
                      {rule.destination && <div className="text-xs text-muted-foreground truncate">{rule.destination}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ruleItems.length > 0
                        ? ruleItems.map((i, idx) => (
                          <div key={idx} className="text-xs">
                            {(i.product as { name: string } | null)?.name ?? "—"}: {i.quantity_liters?.toLocaleString()}L
                          </div>
                        ))
                        : <span>{rule.quantity_liters?.toLocaleString() ?? "—"} L</span>
                      }
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{rule.trigger_day.slice(0, 3)}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {rule.day_offset === 0 ? "Same" : `+${rule.day_offset}d`}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(rule)}>
                        {rule.is_active
                          ? <ToggleRight className="h-4 w-4 text-status-approved-fg" />
                          : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(rule)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                <SelectTrigger><SelectValue placeholder="Select customer...">{(v: string | null) => { if (!v || v === "_none") return "Select customer..."; return customers.find((c) => c.id === v)?.name ?? v; }}</SelectValue></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} label={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Destination</label>
              <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Products</label>
                <Button variant="outline" size="sm" onClick={() => setFormItems((prev) => [...prev, { product_id: "", quantity_liters: "" }])} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {formItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 mb-2 items-end">
                  <div className="flex-1">
                    {idx === 0 && <label className="text-xs text-muted-foreground">Product</label>}
                    <Select
                      value={item.product_id || "_none"}
                      onValueChange={(v) => {
                        setFormItems((prev) => prev.map((fi, i) => i === idx ? { ...fi, product_id: v === "_none" ? "" : (v ?? "") } : fi));
                      }}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Product...">{(v: string | null) => { if (!v || v === "_none") return "Product..."; return products.find((p) => p.id === v)?.name ?? v; }}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id} label={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    {idx === 0 && <label className="text-xs text-muted-foreground">Qty (L)</label>}
                    <Input
                      type="number"
                      className="h-9"
                      value={item.quantity_liters}
                      onChange={(e) => {
                        setFormItems((prev) => prev.map((fi, i) => i === idx ? { ...fi, quantity_liters: e.target.value } : fi));
                      }}
                      placeholder="0"
                    />
                  </div>
                  {formItems.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setFormItems((prev) => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Trigger Day</label>
                <Select value={form.trigger_day} onValueChange={(v) => v && setForm({ ...form, trigger_day: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => <SelectItem key={d} value={d} label={d}>{d}</SelectItem>)}
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
            {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
