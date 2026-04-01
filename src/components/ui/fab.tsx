"use client";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FABProps {
  onClick: () => void;
  icon?: LucideIcon;
  label?: string;
  className?: string;
}

export function FAB({ onClick, icon: Icon = Plus, label, className = "" }: FABProps) {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <Button
      onClick={onClick}
      className={`fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full shadow-lg shadow-primary/25 active:scale-95 transition-transform ${className}`}
      aria-label={label ?? "Add new"}
    >
      <Icon className="h-6 w-6" />
    </Button>
  );
}
