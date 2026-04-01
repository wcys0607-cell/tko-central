"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { NAV_ITEMS } from "./sidebar-nav-items";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const MAX_VISIBLE = 4;

export function MobileBottomNav() {
  const { role } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const filteredItems = NAV_ITEMS.filter(
    (item) => role && item.roles.includes(role)
  );

  const visibleItems = filteredItems.slice(0, MAX_VISIBLE);
  const overflowItems = filteredItems.slice(MAX_VISIBLE);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-safe md:hidden">
      <div className="flex items-center justify-around h-16">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] px-2 transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-tight">
                {item.label}
              </span>
            </Link>
          );
        })}

        {overflowItems.length > 0 && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] px-2 text-muted-foreground transition-colors">
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-tight">More</span>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-4 py-4">
                {overflowItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <item.icon className="h-6 w-6" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
