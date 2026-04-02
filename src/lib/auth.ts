import type { SupabaseClient } from "@supabase/supabase-js";

export type UserRole = "admin" | "manager" | "office" | "driver" | "guest";

export interface DriverProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
}

export const ROUTE_ACCESS: Record<string, UserRole[]> = {
  "/dashboard": ["admin", "manager"],
  "/customers": ["admin", "manager", "office"],
  "/orders": ["admin", "manager", "office"],
  "/stock": ["admin", "manager"],
  "/fleet": ["admin", "manager", "office", "guest"],
  "/driver": ["admin", "manager", "office", "driver"],
  "/reports": ["admin", "manager"],
  "/bukku": ["admin", "office"],
  "/settings": ["admin"],
};

export function getRoleRedirectPath(role: UserRole): string {
  switch (role) {
    case "admin":
    case "manager":
      return "/dashboard";
    case "office":
      return "/orders";
    case "driver":
      return "/driver";
    case "guest":
      return "/fleet";
    default:
      return "/login";
  }
}

export async function getDriverProfile(
  supabase: SupabaseClient,
  authUserId: string
): Promise<DriverProfile | null> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, name, email, phone, role, is_active")
    .eq("auth_user_id", authUserId)
    .single();

  if (error || !data) return null;
  return data as DriverProfile;
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  // Find the matching route prefix
  for (const [route, roles] of Object.entries(ROUTE_ACCESS)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return roles.includes(role);
    }
  }
  // No matching route = deny by default
  return false;
}
