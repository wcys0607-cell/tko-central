import {
  LayoutDashboard,
  ClipboardList,
  Fuel,
  Truck,
  User,
  FileBarChart,
  RefreshCw,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/auth";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    roles: ["admin", "manager"],
  },
  {
    label: "Orders",
    icon: ClipboardList,
    href: "/orders",
    roles: ["admin", "manager", "office"],
  },
  {
    label: "Stock Control",
    icon: Fuel,
    href: "/stock",
    roles: ["admin", "manager"],
  },
  {
    label: "Fleet",
    icon: Truck,
    href: "/fleet",
    roles: ["admin", "manager", "office", "guest"],
  },
  {
    label: "Driver Portal",
    icon: User,
    href: "/driver",
    roles: ["admin", "manager", "office", "driver"],
  },
  {
    label: "Reports",
    icon: FileBarChart,
    href: "/reports",
    roles: ["admin", "manager"],
  },
  {
    label: "Bukku Sync",
    icon: RefreshCw,
    href: "/bukku",
    roles: ["admin", "office"],
  },
  {
    label: "Settings",
    icon: Settings,
    href: "/settings",
    roles: ["admin"],
  },
];
