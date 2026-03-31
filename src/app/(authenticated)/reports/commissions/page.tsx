"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft, Download, ChevronDown, ChevronRight } from "lucide-react";
import { exportMultiSheet } from "@/lib/export-excel";

interface AgentCommission {
  agent_id: string;
  agent_name: string;
  customers: {
    customer_name: string;
    total_qty: number;
    total_commission: number;
    orders: {
      order_date: string;
      customer_name: string;
      quantity_liters: number;
      unit_price: number;
      cost_price: number;
      commission_rate: number;
      total_commission: number;
      dn_number: string;
    }[];
  }[];
  total_qty: number;
  total_commission: number;
}

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-MY", { year: "numeric", month: "long" }),
    });
  }
  return options;
}

export default function CommissionsReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const monthOptions = getMonthOptions();
  const [month, setMonth] = useState(monthOptions[0].value);
  const [data, setData] = useState<AgentCommission[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const generate = useCallback(async () => {
    setLoading(true);
    const [year, m] = month.split("-").map(Number);
    const firstDay = `${year}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(year, m, 0);
    const lastDayStr = `${year}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    const { data: orders } = await supabase
      .from("orders")
      .select(
        "order_date, quantity_liters, unit_price, cost_price, commission_rate, dn_number, middle_man_id, customer:customers!orders_customer_id_fkey(name), agent:customers!orders_middle_man_id_fkey(id, name)"
      )
      .eq("order_type", "agent")
      .gte("order_date", firstDay)
      .lte("order_date", lastDayStr)
      .in("status", ["approved", "delivered"])
      .not("middle_man_id", "is", null)
      .order("order_date");

    // Group by agent → customer
    const agentMap = new Map<string, AgentCommission>();

    for (const o of orders ?? []) {
      const agentId = o.middle_man_id as string;
      const agentName = Array.isArray(o.agent) ? o.agent[0]?.name : o.agent?.name;
      const custName = Array.isArray(o.customer) ? o.customer[0]?.name : o.customer?.name;

      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          agent_id: agentId,
          agent_name: agentName ?? "Unknown",
          customers: [],
          total_qty: 0,
          total_commission: 0,
        });
      }

      const agent = agentMap.get(agentId)!;
      const qty = o.quantity_liters ?? 0;
      const commRate = o.commission_rate ?? 0;
      const totalComm = qty * commRate;

      // Find or create customer bucket
      let custBucket = agent.customers.find((c) => c.customer_name === (custName ?? ""));
      if (!custBucket) {
        custBucket = { customer_name: custName ?? "", total_qty: 0, total_commission: 0, orders: [] };
        agent.customers.push(custBucket);
      }

      custBucket.total_qty += qty;
      custBucket.total_commission += totalComm;
      custBucket.orders.push({
        order_date: o.order_date,
        customer_name: custName ?? "",
        quantity_liters: qty,
        unit_price: o.unit_price ?? 0,
        cost_price: o.cost_price ?? 0,
        commission_rate: commRate,
        total_commission: totalComm,
        dn_number: o.dn_number ?? "",
      });

      agent.total_qty += qty;
      agent.total_commission += totalComm;
    }

    setData(Array.from(agentMap.values()).sort((a, b) => a.agent_name.localeCompare(b.agent_name)));
    setLoading(false);
  }, [supabase, month]);

  useEffect(() => {
    generate();
  }, [generate]);

  function handleDownload() {
    const sheets = data.flatMap((agent) =>
      agent.customers.map((cust) => ({
        name: `${agent.agent_name}-${cust.customer_name}`.slice(0, 31),
        title: `Commission — ${agent.agent_name} — ${cust.customer_name} — ${month}`,
        totalRow: true,
        headers: [
          { key: "order_date", label: "Date" },
          { key: "customer_name", label: "Customer" },
          { key: "quantity_liters", label: "Qty (L)", format: "number" as const },
          { key: "unit_price", label: "Unit Price", format: "currency" as const },
          { key: "cost_price", label: "Cost to Agent", format: "currency" as const },
          { key: "commission_rate", label: "Comm/L", format: "currency" as const },
          { key: "total_commission", label: "Total Commission", format: "currency" as const },
          { key: "dn_number", label: "Receipt No." },
        ],
        data: cust.orders as unknown as Record<string, unknown>[],
      }))
    );

    exportMultiSheet(sheets, `TKO_Commission_${month}`);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#1A3A5C]">Commission Report</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={month} onValueChange={(v) => v && setMonth(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={data.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Download Excel
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Generating...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground">No commission data for this month</p>
      ) : (
        <div className="space-y-3">
          {data.map((agent) => (
            <Card key={agent.agent_id}>
              <CardContent className="pt-4">
                <button
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => toggleExpand(agent.agent_id)}
                >
                  <div>
                    <p className="font-semibold text-[#1A3A5C]">{agent.agent_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {agent.customers.length} customers | {agent.total_qty.toLocaleString()}L
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-green-600">
                      RM {agent.total_commission.toFixed(2)}
                    </span>
                    {expanded.has(agent.agent_id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {expanded.has(agent.agent_id) && (
                  <div className="mt-3 border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left p-2">Customer</th>
                          <th className="text-right p-2">Qty (L)</th>
                          <th className="text-right p-2">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agent.customers.map((c, i) => (
                          <tr key={i} className="border-b">
                            <td className="p-2">{c.customer_name}</td>
                            <td className="p-2 text-right font-mono">{c.total_qty.toLocaleString()}</td>
                            <td className="p-2 text-right font-mono">{c.total_commission.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
