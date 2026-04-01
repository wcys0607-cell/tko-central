"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/providers/auth-provider";
import { NAV_ITEMS } from "./sidebar-nav-items";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function AppSidebar() {
  const { driverProfile, role } = useAuth();
  const pathname = usePathname();

  const filteredItems = NAV_ITEMS.filter(
    (item) => role && item.roles.includes(role)
  );

  const initials = driverProfile?.name
    ? driverProfile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.jpeg"
            alt="Top Kim Oil"
            width={32}
            height={32}
            className="rounded-md object-contain"
          />
          <div>
            <h1 className="text-sm font-bold leading-tight">
              TKO Central
            </h1>
            <p className="text-xs text-sidebar-foreground/60">
              Top Kim Oil
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-accent text-accent-foreground text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {driverProfile?.name ?? "Loading..."}
            </p>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 capitalize"
            >
              {role ?? "..."}
            </Badge>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
