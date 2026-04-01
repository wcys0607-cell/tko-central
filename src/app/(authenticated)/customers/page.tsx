"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Agent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataList, type DataColumn } from "@/components/ui/data-list";
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
import { Plus, Search, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const EMPTY_FORM = {
  name: "",
  short_name: "",
  address: "",
  phone: "",
  email: "",
  tin_number: "",
  credit_limit: "",
  payment_terms: "",
  agent_id: "",
};

export default function CustomersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filtered, setFiltered] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    // Supabase default limit is 1000 — fetch all with range
    const all: Customer[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from("customers")
        .select("*, agent:agent_id(id, name)")
        .order("name")
        .range(from, from + pageSize - 1);
      const rows = (data ?? []) as Customer[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    setCustomers(all);
    // Load agents for the dropdown
    const { data: agentData } = await supabase.from("agents").select("id,name,is_active").eq("is_active", true).order("name");
    setAgents((agentData as Agent[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q) ||
          (c.short_name ?? "").toLowerCase().includes(q)
      )
    );
  }, [customers, search]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      short_name: c.short_name ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      tin_number: c.tin_number ?? "",
      credit_limit: c.credit_limit?.toString() ?? "",
      payment_terms: c.payment_terms?.toString() ?? "",
      agent_id: c.agent_id ?? "",
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim().toUpperCase(),
      short_name: form.short_name.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      tin_number: form.tin_number.trim() || null,
      credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
      payment_terms: form.payment_terms ? parseInt(form.payment_terms) : null,
      agent_id: form.agent_id || null,
      updated_at: new Date().toISOString(),
    };

    let err;
    if (editing) {
      ({ error: err } = await supabase.from("customers").update(payload).eq("id", editing.id));
    } else {
      ({ error: err } = await supabase.from("customers").insert({ ...payload, is_active: true }));
    }

    if (err) {
      toast.error(err.message);
      setError(err.message);
    } else {
      setDialogOpen(false);
      toast.success(editing ? "Customer updated" : "Customer added");
      fetchCustomers();
    }
    setSaving(false);
  }

  async function toggleActive(c: Customer) {
    await supabase.from("customers").update({ is_active: !c.is_active, updated_at: new Date().toISOString() }).eq("id", c.id);
    fetchCustomers();
  }

  const router = useRouter();

  const columns: DataColumn<Customer>[] = [
    {
      key: "name",
      label: "Customer Name",
      className: "max-w-0 w-full",
      mobilePrimary: true,
      render: (c) => (
        <Link href={`/customers/${c.id}`} className="hover:underline block truncate">
          <span className="font-medium text-primary">{c.short_name || c.name}</span>
        </Link>
      ),
    },
    {
      key: "bukku",
      label: "Sync Status",
      className: "text-center whitespace-nowrap",
      mobileVisible: true,
      render: (c) => <StatusBadge status={c.bukku_sync_status ?? "pending"} type="bukku" />,
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} total customers</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table / Cards */}
      <DataList
        data={filtered}
        columns={columns}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
        loading={loading}
        emptyMessage={search ? "No customers match your search." : "No customers yet. Add your first customer."}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Company name (will be saved as uppercase)"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Short Name</label>
              <Input
                value={form.short_name}
                onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                placeholder="For mobile display"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="60xxxxxxxxx"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                type="email"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Address</label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">TIN Number</label>
              <Input
                value={form.tin_number}
                onChange={(e) => setForm({ ...form, tin_number: e.target.value })}
                placeholder="Tax ID (LHDN)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Credit Limit (RM)</label>
                <Input
                  value={form.credit_limit}
                  onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                  type="number"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Payment Terms (days)</label>
                <Input
                  value={form.payment_terms}
                  onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
                  type="number"
                  placeholder="30"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Agent</label>
              <Select
                value={form.agent_id || "_none"}
                onValueChange={(v) => v && setForm({ ...form, agent_id: v === "_none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None">{(v: string | null) => { if (!v || v === "_none") return "None"; return agents.find((a) => a.id === v)?.name ?? v; }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none" label="None">None</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id} label={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
