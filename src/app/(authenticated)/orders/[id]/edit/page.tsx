"use client";

import { useEffect, useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";
import OrderForm from "@/components/orders/order-form";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }: { data: Order | null }) => {
        if (data?.stock_sync_status === "synced") {
          router.replace(`/orders/${id}`);
          return;
        }
        setOrder(data);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!order) return <div className="p-6 text-destructive">Order not found.</div>;

  return <OrderForm existingOrder={order} />;
}
