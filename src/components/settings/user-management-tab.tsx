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
import { Plus, Pencil, UserX, UserCheck, X, Truck } from "lucide-react";
import { toast } from "sonner";

interface Vehicle {
  id: string;
  plate_number: string;
  type: string | null;
}

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

  // Vehicle assignment
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [assignedVehicleIds, setAssignedVehicleIds] = useState<string[]>([]);
  const [addVehicleId, setAddVehicleId] = useState("");
  // All assignments for table display: driverId -> plate_number[]
  const [allAssignments, setAllAssignments] = useState<Map<string, string[]>>(new Map());

  async function loadDrivers() {
    const [dRes, vRes, aRes] = await Promise.all([
      supabase.from("drivers").select("id, name, email, phone, ic_number, role, is_active").order("name"),
      supabase.from("vehicles").select("id, plate_number, type").eq("is_active", true).order("plate_number"),
      supabase.from("driver_vehicle_assignments").select("driver_id, vehicle_id"),
    ]);
    if (dRes.data) setDrivers(dRes.data);
    const vehicles = vRes.data ?? [];
    if (vehicles.length > 0) setAllVehicles(vehicles);

    // Build assignment map
    const vMap = new Map<string, string>();
    for (const v of vehicles) vMap.set(v.id, v.plate_number);
    const aMap = new Map<string, string[]>();
    for (const a of aRes.data ?? []) {
      const plate = vMap.get(a.vehicle_id);
      if (!plate) continue;
      if (!aMap.has(a.driver_id)) aMap.set(a.driver_id, []);
      aMap.get(a.driver_id)!.push(plate);
    }
    setAllAssignments(aMap);
    setLoading(false);
  }

  useEffect(() => {
    loadDrivers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAssignments(driverId: string) {
    const { data } = await supabase
      .from("driver_vehicle_assignments")
      .select("vehicle_id")
      .eq("driver_id", driverId);
    setAssignedVehicleIds((data ?? []).map((a: { vehicle_id: string }) => a.vehicle_id));
  }

  async function addVehicleAssignment() {
    if (!addVehicleId || !editingId) return;
    const { error } = await supabase
      .from("driver_vehicle_assignments")
      .insert({ driver_id: editingId, vehicle_id: addVehicleId });
    if (error) {
      if (error.code === "23505") toast.error("Vehicle already assigned");
      else toast.error(error.message);
    } else {
      toast.success(`Assigned ${allVehicles.find((v) => v.id === addVehicleId)?.plate_number}`);
      setAddVehicleId("");
      loadAssignments(editingId);
      loadDrivers(); // refresh table column
    }
  }

  async function removeVehicleAssignment(vehicleId: string) {
    if (!editingId) return;
    await supabase
      .from("driver_vehicle_assignments")
      .delete()
      .eq("driver_id", editingId)
      .eq("vehicle_id", vehicleId);
    loadAssignments(editingId);
    loadDrivers(); // refresh table column
  }

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
    setAssignedVehicleIds([]);
    setAddVehicleId("");
    setError("");
    setDialogOpen(true);
    loadAssignments(driver.id);
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
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "manager":
        return "bg-status-delivered-bg text-status-delivered-fg border-status-delivered-fg/20";
      case "office":
        return "bg-status-approved-bg text-status-approved-fg border-status-approved-fg/20";
      case "guest":
        return "bg-secondary text-secondary-foreground border-secondary";
      default:
        return "bg-muted text-muted-foreground border-muted";
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
                <TableHead className="hidden md:table-cell">Vehicles</TableHead>
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
                  <TableCell className="hidden md:table-cell">
                    {(allAssignments.get(driver.id) ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {allAssignments.get(driver.id)!.map((plate) => (
                          <Badge key={plate} variant="outline" className="text-[10px] font-mono">
                            {plate}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={driver.is_active ? "default" : "secondary"}
                      className={
                        driver.is_active
                          ? "bg-status-approved-fg"
                          : "bg-muted-foreground text-white"
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
                          <UserX className="h-4 w-4 text-destructive" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-status-approved-fg" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {drivers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                  <SelectItem value="admin" label="Admin">Admin</SelectItem>
                  <SelectItem value="manager" label="Manager">Manager</SelectItem>
                  <SelectItem value="office" label="Office">Office</SelectItem>
                  <SelectItem value="driver" label="Driver">Driver</SelectItem>
                  <SelectItem value="guest" label="Guest">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vehicle assignment — show when editing a driver */}
            {editingId && form.role === "driver" && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> Assigned Vehicles
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {assignedVehicleIds.length === 0 && (
                    <span className="text-xs text-muted-foreground">No vehicles assigned</span>
                  )}
                  {assignedVehicleIds.map((vid) => {
                    const v = allVehicles.find((veh) => veh.id === vid);
                    return (
                      <Badge key={vid} variant="secondary" className="gap-1 pr-1">
                        {v?.plate_number ?? "Unknown"}
                        <button
                          type="button"
                          onClick={() => removeVehicleAssignment(vid)}
                          className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <Select
                    value={addVehicleId}
                    onValueChange={(v) => v && setAddVehicleId(v)}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Add vehicle...">{
                        (val: string | null) => {
                          if (!val) return "Add vehicle...";
                          const found = allVehicles.find((v) => v.id === val);
                          return found ? found.plate_number : "Add vehicle...";
                        }
                      }</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {allVehicles
                        .filter((v) => !assignedVehicleIds.includes(v.id))
                        .map((v) => (
                          <SelectItem key={v.id} value={v.id} label={v.plate_number}>
                            {v.plate_number} {v.type ? `(${v.type})` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={addVehicleAssignment}
                    disabled={!addVehicleId}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
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
