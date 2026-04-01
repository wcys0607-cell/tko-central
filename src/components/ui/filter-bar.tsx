"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

interface FilterBarProps {
  children: ReactNode;
  activeCount?: number;
  onClear?: () => void;
}

export function FilterBar({ children, activeCount = 0, onClear }: FilterBarProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <div className="flex flex-wrap gap-3 items-center">
        {children}
        {activeCount > 0 && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="sm" className="gap-2" />}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeCount > 0 && (
          <span className="bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          {children}
        </div>
        <div className="flex gap-3 pt-2 pb-4">
          {onClear && (
            <Button variant="outline" className="flex-1" onClick={() => { onClear(); setOpen(false); }}>
              Clear All
            </Button>
          )}
          <Button className="flex-1" onClick={() => setOpen(false)}>
            Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
