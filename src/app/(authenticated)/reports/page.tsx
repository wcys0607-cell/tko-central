"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  FileBarChart,
  Users,
  Handshake,
  Fuel,
  TrendingUp,
  Droplets,
  Truck,
} from "lucide-react";

const reports = [
  {
    title: "Wages Report",
    desc: "Monthly driver wages with Excel download & WhatsApp distribution",
    href: "/reports/wages",
    icon: Users,
    color: "text-status-approved-fg",
  },
  {
    title: "Commission Report",
    desc: "Monthly agent commissions with customer breakdown",
    href: "/reports/commissions",
    icon: Handshake,
    color: "text-muted-foreground",
  },
  {
    title: "SmartStream Statement",
    desc: "Monthly SmartStream orders grouped by truck",
    href: "/reports/smartstream",
    icon: Fuel,
    color: "text-status-delivered-fg",
  },
  {
    title: "Sales Summary",
    desc: "Sales by customer, product, driver, or month",
    href: "/reports/sales",
    icon: TrendingUp,
    color: "text-accent",
  },
  {
    title: "Stock Report",
    desc: "Stock movements, balances, and variance",
    href: "/reports/stock",
    icon: Droplets,
    color: "text-status-delivered-fg",
  },
  {
    title: "Fleet Report",
    desc: "Upcoming renewals and maintenance costs",
    href: "/reports/fleet",
    icon: Truck,
    color: "text-destructive",
  },
];

export default function ReportsPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <FileBarChart className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-primary">Reports</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="h-full cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <r.icon className={`w-6 h-6 ${r.color} flex-shrink-0`} />
                  <div>
                    <h3 className="font-semibold text-primary">{r.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{r.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
