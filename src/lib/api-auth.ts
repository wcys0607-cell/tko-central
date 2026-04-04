import { createClient } from "@/lib/supabase/server";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  auth_user_id: string;
}

/**
 * Verify the request is from an authenticated, active user.
 * Optionally restrict to specific roles.
 * Returns the driver profile or null if unauthorized.
 */
export async function getAuthenticatedUser(
  allowedRoles?: string[]
): Promise<{ user: AuthenticatedUser | null; error?: string; status?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, error: "Unauthorized", status: 401 };
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, name, role, is_active, auth_user_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!driver || !driver.is_active) {
    return { user: null, error: "Unauthorized", status: 401 };
  }

  if (allowedRoles && !allowedRoles.includes(driver.role)) {
    return { user: null, error: "Forbidden", status: 403 };
  }

  return { user: driver as AuthenticatedUser };
}
