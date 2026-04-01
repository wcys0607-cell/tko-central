import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ROUTE_ACCESS, getRoleRedirectPath, type UserRole } from "@/lib/auth";

// Routes that don't require auth
const PUBLIC_ROUTES = ["/login"];
// Routes handled by Next.js / API — skip role check
const SKIP_ROUTES = ["/api/", "/_next/", "/favicon"];

// Cookie name for cached role — avoids querying `drivers` on every navigation
const ROLE_COOKIE = "tko-role";
// How long to cache role (seconds) — re-check every 5 minutes
const ROLE_CACHE_TTL = 300;

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
      // Try cached role first
      const cachedRole = request.cookies.get(ROLE_COOKIE)?.value;
      if (cachedRole) {
        return NextResponse.redirect(
          new URL(getRoleRedirectPath(cachedRole as UserRole), request.url)
        );
      }

      const { data: driver } = await supabase
        .from("drivers")
        .select("role, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (driver?.role && driver.is_active) {
        const redirectUrl = new URL(getRoleRedirectPath(driver.role as UserRole), request.url);
        const res = NextResponse.redirect(redirectUrl);
        res.cookies.set(ROLE_COOKIE, driver.role, {
          maxAge: ROLE_CACHE_TTL,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
        return res;
      }
    }
    return response;
  }

  // Protected routes — must be logged in
  if (!user) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete(ROLE_COOKIE);
    return res;
  }

  // Try cached role from cookie to skip the DB query
  const cachedRole = request.cookies.get(ROLE_COOKIE)?.value as UserRole | undefined;
  let role: UserRole;

  if (cachedRole) {
    role = cachedRole;
  } else {
    // No cache — fetch from DB
    const { data: driver } = await supabase
      .from("drivers")
      .select("role, is_active")
      .eq("auth_user_id", user.id)
      .single();

    if (!driver?.role) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete(ROLE_COOKIE);
      return res;
    }

    // Block deactivated users
    if (!driver.is_active) {
      await supabase.auth.signOut();
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete(ROLE_COOKIE);
      return res;
    }

    role = driver.role as UserRole;

    // Cache role for subsequent navigations
    response.cookies.set(ROLE_COOKIE, role, {
      maxAge: ROLE_CACHE_TTL,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

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
