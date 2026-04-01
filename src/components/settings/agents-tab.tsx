"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Agent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function AgentsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState({ name: "", ic_number: "", bank_account: "", phone: "" });
  const [saving, setSaving] = useState(false);

  async function loadAgents() {
    const { data } = await supabase
      .from("agents")
      .select("*")
      .order("name");
    setAgents((data as Agent[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAgents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditingAgent(null);
    setForm({ name: "", ic_number: "", bank_account: "", phone: "" });
    setDialogOpen(true);
  }

  function openEdit(agent: Agent) {
    setEditingAgent(agent);
    setForm({
      name: agent.name,
      ic_number: agent.ic_number ?? "",
      bank_account: agent.bank_account ?? "",
      phone: agent.phone ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Agent name is required");
      return;
    }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      ic_number: form.ic_number.trim() || null,
      bank_account: form.bank_account.trim() || null,
      phone: form.phone.trim() || null,
    };

    if (editingAgent) {
      const { error } = await supabase
        .from("agents")
        .update(payload)
        .eq("id", editingAgent.id);
      if (error) toast.error(error.message);
      else toast.success("Agent updated");
    } else {
      const { error } = await supabase
        .from("agents")
        .insert(payload);
      if (error) toast.error(error.message);
      else toast.success("Agent added");
    }

    setSaving(false);
    setDialogOpen(false);
    loadAgents();
  }

  async function handleToggleActive(agent: Agent) {
    await supabase
      .from("agents")
      .update({ is_active: !agent.is_active })
      .eq("id", agent.id);
    loadAgents();
  }

  async function handleDelete(agent: Agent) {
    // Check if any customers reference this agent
    const { count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent.id);

    if (count && count > 0) {
      toast.error(`Cannot delete — ${count} customer(s) linked to this agent. Deactivate instead.`);
      return;
    }

    const { error } = await supabase.from("agents").delete().eq("id", agent.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Agent deleted");
      loadAgents();
    }
  }

  if (loading) return <p className="text-muted-foreground p-4">Loading...</p>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Agents / Middle Men</CardTitle>
          <Button size="sm" onClick={openAdd} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Agent
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Agents are linked to customers. When creating an order for a linked customer, the agent is auto-filled.
        </p>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="text-left p-2 font-medium">Name</th>
                <th className="text-left p-2 font-medium hidden md:table-cell">IC Number</th>
                <th className="text-left p-2 font-medium hidden md:table-cell">Bank Account</th>
                <th className="text-left p-2 font-medium hidden lg:table-cell">Phone</th>
                <th className="text-center p-2 font-medium">Status</th>
                <th className="text-right p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="p-2 font-medium">{agent.name}</td>
                  <td className="p-2 text-muted-foreground hidden md:table-cell">{agent.ic_number || "—"}</td>
                  <td className="p-2 text-muted-foreground hidden md:table-cell">{agent.bank_account || "—"}</td>
                  <td className="p-2 text-muted-foreground hidden lg:table-cell">{agent.phone || "—"}</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => handleToggleActive(agent)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        agent.is_active
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {agent.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(agent)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(agent)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">No agents found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Edit Agent" : "Add Agent"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Agent name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">IC Number</label>
              <Input
                value={form.ic_number}
                onChange={(e) => setForm({ ...form, ic_number: e.target.value })}
                placeholder="e.g. 840607015455"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Bank Account</label>
              <Input
                value={form.bank_account}
                onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                placeholder="e.g. MBB 001020316721"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 01X-XXXXXXX"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingAgent ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
