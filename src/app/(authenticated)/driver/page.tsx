"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, Package, Wallet } from "lucide-react";

export default function DriverPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[#1A3A5C]">Driver Portal</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/driver/checklist">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <ClipboardCheck className="w-10 h-10 text-[#E8A020]" />
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
              <Package className="w-10 h-10 text-[#1A3A5C]" />
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
              <Wallet className="w-10 h-10 text-green-600" />
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
