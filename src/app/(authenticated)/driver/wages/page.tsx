"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Order } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function getMonthOptions(): { value: string; label: string }[] {
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

export default function DriverWagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { driverProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);

  const monthOptions = getMonthOptions();

  const load = useCallback(async () => {
    if (!driverProfile?.id) return;
    setLoading(true);

    const [year, m] = month.split("-").map(Number);
    const firstDay = `${year}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(year, m, 0);
    const lastDayStr = `${year}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    const { data } = await supabase
      .from("orders")
      .select("*, customer:customers!orders_customer_id_fkey(id, name)")
      .eq("driver_id", driverProfile.id)
      .gte("order_date", firstDay)
      .lte("order_date", lastDayStr)
      .in("status", ["approved", "delivered"])
      .order("order_date");

    if (data) setOrders(data);
    setLoading(false);
  }, [supabase, driverProfile, month]);

  useEffect(() => {
    load();
  }, [load]);

  const totalWages = orders.reduce((s, o) => s + (o.wages ?? 0), 0);
  const totalAllowance = orders.reduce((s, o) => s + (o.allowance ?? 0), 0);
  const totalTransport = orders.reduce((s, o) => s + (o.transport ?? 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link href="/driver">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-primary">My Wages</h1>
      </div>

      <Select value={month} onValueChange={(v) => v && setMonth(v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((o) => (
            <SelectItem key={o.value} value={o.value} label={o.label}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Wages</p>
            <p className="text-lg font-bold text-status-approved-fg">RM {totalWages.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Allowance</p>
            <p className="text-lg font-bold text-status-delivered-fg">RM {totalAllowance.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Transport</p>
            <p className="text-lg font-bold">RM {totalTransport.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Total: RM {(totalWages + totalAllowance + totalTransport).toFixed(2)} | {orders.length} deliveries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-4">Loading...</p>
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No deliveries this month</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Dest.</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">Wages</th>
                    <th className="text-right p-2">Allow.</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="p-2 whitespace-nowrap text-xs">
                        {new Date(o.order_date).toLocaleDateString("en-MY", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-2 text-xs max-w-[100px] truncate">
                        {o.customer?.name ?? "—"}
                      </td>
                      <td className="p-2 text-xs max-w-[80px] truncate">
                        {o.destination || "—"}
                      </td>
                      <td className="p-2 text-right text-xs font-mono">
                        {o.quantity_liters?.toLocaleString() ?? "—"}
                      </td>
                      <td className="p-2 text-right text-xs font-mono">
                        {o.wages ? o.wages.toFixed(2) : "—"}
                      </td>
                      <td className="p-2 text-right text-xs font-mono">
                        {o.allowance ? o.allowance.toFixed(2) : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted font-bold">
                    <td className="p-2" colSpan={3}>Total</td>
                    <td className="p-2 text-right text-xs font-mono">
                      {orders.reduce((s, o) => s + (o.quantity_liters ?? 0), 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right text-xs font-mono">{totalWages.toFixed(2)}</td>
                    <td className="p-2 text-right text-xs font-mono">{totalAllowance.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
