"use client";

import { useEffect, useState, useCallback, use, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer, CustomerAddress } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  CreditCard,
  FileText,
  User,
  Landmark,
} from "lucide-react";

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ElementType;
  label: string;
  value: string | number | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [custRes, addrRes, orderRes] = await Promise.all([
      supabase
        .from("customers")
        .select("*, middle_man:middle_man_id(id, name)")
        .eq("id", id)
        .single(),
      supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", id)
        .order("address"),
      supabase
        .from("orders")
        .select("total_sale")
        .eq("customer_id", id)
        .in("status", ["approved", "delivered"]),
    ]);

    if (custRes.data) setCustomer(custRes.data as Customer);
    if (addrRes.data) setAddresses(addrRes.data as CustomerAddress[]);

    const orders = orderRes.data ?? [];
    setOrderCount(orders.length);
    setTotalRevenue(
      orders.reduce((s: number, o: { total_sale: number | null }) => s + (o.total_sale ?? 0), 0)
    );

    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading customer...</div>;
  }

  if (!customer) {
    return <div className="p-6 text-muted-foreground">Customer not found</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">{customer.name}</h1>
          {customer.short_name && (
            <p className="text-sm text-muted-foreground">{customer.short_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={customer.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}
          >
            {customer.is_active ? "Active" : "Inactive"}
          </Badge>
          {customer.bukku_contact_id && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              Bukku #{customer.bukku_contact_id}
            </Badge>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Total Orders</p>
            <p className="text-lg font-bold">{orderCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold">RM {totalRevenue.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Payment Terms</p>
            <p className="text-lg font-bold">{customer.payment_terms ?? "—"} days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Contact Details</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={Phone} label="Phone" value={customer.phone} />
            <InfoRow icon={Mail} label="Email" value={customer.email} />
            <InfoRow icon={Phone} label="Fax" value={customer.fax} />
            <InfoRow icon={Globe} label="Website" value={customer.website} />
            <InfoRow icon={User} label="Contact Person" value={customer.contact_person} />
            <InfoRow icon={Phone} label="Contact Person Phone" value={customer.contact_person_phone} />
            <InfoRow icon={Mail} label="Contact Person Email" value={customer.contact_person_email} />
            {!customer.phone && !customer.email && !customer.contact_person && (
              <p className="text-sm text-muted-foreground py-2">No contact details available</p>
            )}
          </CardContent>
        </Card>

        {/* Business Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Business Details</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={FileText} label="TIN Number" value={customer.tin_number} />
            <InfoRow icon={Building2} label="Registration Number (SSM)" value={customer.registration_number} />
            <InfoRow icon={CreditCard} label="Credit Limit" value={customer.credit_limit ? `RM ${customer.credit_limit.toLocaleString()}` : null} />
            <InfoRow icon={CreditCard} label="Payment Terms" value={customer.payment_terms ? `${customer.payment_terms} days` : null} />
            <InfoRow icon={Landmark} label="Bank" value={customer.bank_name} />
            <InfoRow icon={Landmark} label="Bank Account" value={customer.bank_account} />
            {customer.middle_man && (
              <InfoRow icon={User} label="Middle Man / Agent" value={(customer.middle_man as { name: string }).name} />
            )}
          </CardContent>
        </Card>

        {/* Addresses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Addresses</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={MapPin} label="Main Address" value={customer.address} />
            <InfoRow icon={MapPin} label="Billing Address" value={customer.billing_address} />
            <InfoRow icon={MapPin} label="Shipping Address" value={customer.shipping_address} />
          </CardContent>
        </Card>

        {/* Delivery Addresses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Delivery Destinations ({addresses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No delivery addresses saved</p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {addresses.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                    <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">{a.address}</span>
                    {a.source === "bukku" && (
                      <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600 px-1">
                        Bukku
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {customer.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Info banner */}
      {customer.bukku_contact_id && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          This customer is synced from Bukku (Contact #{customer.bukku_contact_id}). To update details, edit in Bukku and run Sync Contacts.
        </div>
      )}
    </div>
  );
}
