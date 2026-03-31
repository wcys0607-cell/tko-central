"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronDown } from "lucide-react";

export function TopBar() {
  const { driverProfile, role, signOut } = useAuth();

  const initials = driverProfile?.name
    ? driverProfile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="gap-2 px-2" />}
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-[#1A3A5C] text-white text-xs font-bold">
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
          <DropdownMenuItem onClick={signOut} className="text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
