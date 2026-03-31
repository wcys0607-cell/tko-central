import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ROUTE_ACCESS, type UserRole } from "@/lib/auth";

// Routes that don't require auth
const PUBLIC_ROUTES = ["/login"];

export async function middleware(request: NextRequest) {
  const { supabase, user, response } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Public routes — allow through
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    if (user) {
      // Logged-in user visiting /login → redirect to their role page
      const { data: driver } = await supabase
        .from("drivers")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (driver?.role) {
        const redirectMap: Record<string, string> = {
          admin: "/dashboard",
          manager: "/dashboard",
          office: "/orders",
          driver: "/driver",
        };
        const dest = redirectMap[driver.role] || "/dashboard";
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
    return response;
  }

  // Protected routes — must be logged in
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check role-based access
  const { data: driver } = await supabase
    .from("drivers")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (!driver?.role) {
    // No driver profile — redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = driver.role as UserRole;

  // Check if role can access this path
  for (const [route, roles] of Object.entries(ROUTE_ACCESS)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      if (!roles.includes(role)) {
        // Redirect to default page for their role
        const redirectMap: Record<string, string> = {
          admin: "/dashboard",
          manager: "/dashboard",
          office: "/orders",
          driver: "/driver",
        };
        return NextResponse.redirect(
          new URL(redirectMap[role] || "/dashboard", request.url)
        );
      }
      break;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
