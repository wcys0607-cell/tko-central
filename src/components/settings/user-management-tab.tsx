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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, UserX, UserCheck } from "lucide-react";

interface Driver {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ic_number: string | null;
  role: string;
  is_active: boolean;
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  phone: string;
  ic_number: string;
  role: string;
}

const emptyForm: UserForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  ic_number: "",
  role: "driver",
};

export function UserManagementTab() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = useMemo(() => createClient(), []);

  async function loadDrivers() {
    const { data } = await supabase
      .from("drivers")
      .select("id, name, email, phone, ic_number, role, is_active")
      .order("name");
    if (data) setDrivers(data);
    setLoading(false);
  }

  useEffect(() => {
    loadDrivers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(driver: Driver) {
    setEditingId(driver.id);
    setForm({
      name: driver.name,
      email: driver.email ?? "",
      password: "",
      phone: driver.phone ?? "",
      ic_number: driver.ic_number ?? "",
      role: driver.role,
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    if (editingId) {
      // Update existing driver
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: form.name,
          phone: form.phone,
          ic_number: form.ic_number,
          role: form.role,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to update user");
        setSaving(false);
        return;
      }
    } else {
      // Create new user
      if (!form.email || !form.password || !form.name) {
        setError("Name, email, and password are required");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to create user");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDialogOpen(false);
    loadDrivers();
  }

  async function toggleActive(driver: Driver) {
    await supabase
      .from("drivers")
      .update({ is_active: !driver.is_active })
      .eq("id", driver.id);
    loadDrivers();
  }

  function roleBadgeColor(role: string) {
    switch (role) {
      case "admin":
        return "bg-red-100 text-red-700 border-red-200";
      case "manager":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "office":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading users...</p>;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add User
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell className="font-medium">{driver.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {driver.email || "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {driver.phone || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`capitalize ${roleBadgeColor(driver.role)}`}
                    >
                      {driver.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={driver.is_active ? "default" : "secondary"}
                      className={
                        driver.is_active
                          ? "bg-green-600"
                          : "bg-gray-400 text-white"
                      }
                    >
                      {driver.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(driver)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive(driver)}
                      >
                        {driver.is_active ? (
                          <UserX className="h-4 w-4 text-red-500" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {drivers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No users yet. Click &quot;Add User&quot; to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit User" : "Add New User"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            {!editingId && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email *</label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="user@topkim.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password *</label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder="Minimum 6 characters"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="60xxxxxxxxx"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">IC Number</label>
              <Input
                value={form.ic_number}
                onChange={(e) =>
                  setForm({ ...form, ic_number: e.target.value })
                }
                placeholder="Malaysian IC"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select
                value={form.role}
                onValueChange={(v) => v && setForm({ ...form, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
