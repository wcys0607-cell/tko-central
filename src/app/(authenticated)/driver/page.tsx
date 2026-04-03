"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, Package, Wallet, Truck } from "lucide-react";

export default function DriverPage() {
  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-primary">Driver Portal</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/driver/vehicles">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <Truck className="w-10 h-10 text-primary" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">My Vehicles</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Documents, expiry & maintenance
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/driver/checklist">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <ClipboardCheck className="w-10 h-10 text-accent" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Daily Checklist</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Pre-trip vehicle inspection
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/driver/orders">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <Package className="w-10 h-10 text-primary" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">My Orders</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                View assigned deliveries
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/driver/wages">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <Wallet className="w-10 h-10 text-status-approved-fg" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">My Wages</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Monthly wage statements
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
