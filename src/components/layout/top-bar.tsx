"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronDown, Sun, Moon, Monitor } from "lucide-react";
import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/orders": "Orders",
  "/customers": "Customers",
  "/stock": "Stock Control",
  "/fleet": "Fleet",
  "/driver": "Driver Portal",
  "/reports": "Reports",
  "/bukku": "Bukku Sync",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === path || pathname.startsWith(path + "/")) return title;
  }
  return "TKO Central";
}

export function TopBar() {
  const { driverProfile, role, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  const initials = driverProfile?.name
    ? driverProfile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4">
      {/* Sidebar trigger + title */}
      <SidebarTrigger className="-ml-1 hidden md:flex" />
      <h2 className="text-base font-semibold text-foreground">
        {pageTitle}
      </h2>

      <div className="flex-1" />

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => {
          const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
          setTheme(next);
        }}
        aria-label="Toggle theme"
      >
        {theme === "light" && <Sun className="h-4 w-4" />}
        {theme === "dark" && <Moon className="h-4 w-4" />}
        {theme === "system" && <Monitor className="h-4 w-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="gap-2 px-2" />}
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm font-medium">
            {driverProfile?.name}
          </span>
          <Badge
            variant="outline"
            className="hidden sm:inline-flex text-[10px] capitalize"
          >
            {role}
          </Badge>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="px-2 py-1.5 sm:hidden">
            <p className="text-sm font-medium">{driverProfile?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
          <DropdownMenuSeparator className="sm:hidden" />
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
