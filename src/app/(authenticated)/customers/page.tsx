"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, Eye } from "lucide-react";
import Link from "next/link";

const EMPTY_FORM = {
  name: "",
  short_name: "",
  address: "",
  phone: "",
  email: "",
  tin_number: "",
  credit_limit: "",
  payment_terms: "",
  middle_man_id: "",
};

export default function CustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
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
        .select("*, middle_man:middle_man_id(id, name)")
        .order("name")
        .range(from, from + pageSize - 1);
      const rows = (data ?? []) as Customer[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    setCustomers(all);
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
      middle_man_id: c.middle_man_id ?? "",
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
      middle_man_id: form.middle_man_id || null,
      updated_at: new Date().toISOString(),
    };

    let err;
    if (editing) {
      ({ error: err } = await supabase.from("customers").update(payload).eq("id", editing.id));
    } else {
      ({ error: err } = await supabase.from("customers").insert({ ...payload, is_active: true }));
    }

    if (err) {
      setError(err.message);
    } else {
      setDialogOpen(false);
      fetchCustomers();
    }
    setSaving(false);
  }

  async function toggleActive(c: Customer) {
    await supabase.from("customers").update({ is_active: !c.is_active, updated_at: new Date().toISOString() }).eq("id", c.id);
    fetchCustomers();
  }

  // Middle men = customers who are referenced as middle_man_id by others (or just all active customers)
  const middleMenOptions = customers.filter((c) => c.is_active);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} total customers</p>
        </div>
        <Button onClick={openNew} className="bg-[#1A3A5C] hover:bg-[#15304D] gap-2">
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

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Middle Man</TableHead>
              <TableHead className="text-right">Credit Limit</TableHead>
              <TableHead className="text-center">Terms (days)</TableHead>
              <TableHead className="text-center">Bukku</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  {search ? "No customers match your search." : "No customers yet. Add your first customer."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className="hover:bg-gray-50">
                  <TableCell>
                    <Link href={`/customers/${c.id}`} className="hover:underline">
                      <div className="font-medium text-[#1A3A5C]">{c.name}</div>
                      {c.short_name && <div className="text-xs text-muted-foreground">{c.short_name}</div>}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {c.middle_man ? (c.middle_man as { name: string }).name : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {c.credit_limit ? `RM ${c.credit_limit.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">{c.payment_terms ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="secondary"
                      className={
                        c.bukku_sync_status === "synced"
                          ? "bg-green-100 text-green-700"
                          : c.bukku_sync_status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }
                    >
                      {c.bukku_sync_status ?? "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="secondary"
                      className={c.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/customers/${c.id}`}>
                        <Button variant="ghost" size="icon" title="View details">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive(c)}
                        title={c.is_active ? "Deactivate" : "Activate"}
                      >
                        {c.is_active ? (
                          <ToggleRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
              <label className="text-sm font-medium">Middle Man / Agent</label>
              <Select
                value={form.middle_man_id || "_none"}
                onValueChange={(v) => v && setForm({ ...form, middle_man_id: v === "_none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {middleMenOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#1A3A5C] hover:bg-[#15304D]">
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
