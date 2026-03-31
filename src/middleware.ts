import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ROUTE_ACCESS, getRoleRedirectPath, type UserRole } from "@/lib/auth";

// Routes that don't require auth
const PUBLIC_ROUTES = ["/login"];
// Routes handled by Next.js / API — skip role check
const SKIP_ROUTES = ["/api/", "/_next/", "/favicon"];

export async function middleware(request: NextRequest) {
  const { supabase, user, response } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Skip API routes and static assets
  if (SKIP_ROUTES.some((r) => pathname.startsWith(r))) {
    return response;
  }

  // Public routes — allow through
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    if (user) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("role, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (driver?.role && driver.is_active) {
        return NextResponse.redirect(
          new URL(getRoleRedirectPath(driver.role as UserRole), request.url)
        );
      }
    }
    return response;
  }

  // Protected routes — must be logged in
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Fetch driver profile with is_active check
  const { data: driver } = await supabase
    .from("drivers")
    .select("role, is_active")
    .eq("auth_user_id", user.id)
    .single();

  if (!driver?.role) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Block deactivated users
  if (!driver.is_active) {
    // Sign them out and redirect to login
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = driver.role as UserRole;
  const defaultPath = getRoleRedirectPath(role);

  // Default-deny: check if route is in ROUTE_ACCESS
  let routeMatched = false;
  for (const [route, roles] of Object.entries(ROUTE_ACCESS)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      routeMatched = true;
      if (!roles.includes(role)) {
        return NextResponse.redirect(new URL(defaultPath, request.url));
      }
      break;
    }
  }

  // If no route matched in ROUTE_ACCESS, deny access (default-deny)
  if (!routeMatched && pathname !== "/") {
    return NextResponse.redirect(new URL(defaultPath, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.jpeg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
