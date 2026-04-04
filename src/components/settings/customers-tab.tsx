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
import { Search, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function CustomersTab() {
  const supabase = useMemo(() => createClient(), []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filtered, setFiltered] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
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
    const { data: agentData } = await supabase
      .from("agents")
      .select("id,name,is_active")
      .eq("is_active", true)
      .order("name");
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

  // Agent-only edit dialog
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentEditCustomer, setAgentEditCustomer] = useState<Customer | null>(null);
  const [agentEditValue, setAgentEditValue] = useState("");
  const [agentSaving, setAgentSaving] = useState(false);

  function openAgentEdit(c: Customer) {
    setAgentEditCustomer(c);
    setAgentEditValue(c.agent_id ?? "");
    setAgentDialogOpen(true);
  }

  async function handleAgentSave() {
    if (!agentEditCustomer) return;
    setAgentSaving(true);
    const { error: err } = await supabase
      .from("customers")
      .update({ agent_id: agentEditValue || null, updated_at: new Date().toISOString() })
      .eq("id", agentEditCustomer.id);
    if (err) {
      toast.error(err.message);
    } else {
      toast.success("Agent updated");
      setAgentDialogOpen(false);
      fetchCustomers();
    }
    setAgentSaving(false);
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
      key: "agent",
      label: "Agent",
      className: "whitespace-nowrap",
      render: (c) => (
        <span className="text-sm text-muted-foreground">
          {(c.agent as { name?: string } | null)?.name ?? "\u2014"}
        </span>
      ),
    },
    {
      key: "bukku",
      label: "Sync",
      className: "text-center whitespace-nowrap",
      mobileVisible: true,
      render: (c) => <StatusBadge status={c.bukku_sync_status ?? "pending"} type="bukku" />,
    },
    {
      key: "actions",
      label: "",
      className: "w-[60px]",
      render: (c) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            openAgentEdit(c);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{customers.length} total customers</p>
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
        emptyMessage={search ? "No customers match your search." : "No customers yet. Sync from Bukku to import contacts."}
      />

      {/* Edit Agent Dialog */}
      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <p className="text-sm text-muted-foreground">{agentEditCustomer?.short_name || agentEditCustomer?.name}</p>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Agent</label>
            <Select
              value={agentEditValue || "_none"}
              onValueChange={(v) => v && setAgentEditValue(v === "_none" ? "" : v)}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAgentSave} disabled={agentSaving} className="bg-primary hover:bg-primary/90">
              {agentSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
