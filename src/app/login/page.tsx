"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getRoleRedirectPath, type UserRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      toast.error(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("role, is_active")
        .eq("auth_user_id", data.user.id)
        .single();

      if (!driver?.role) {
        toast.error("No driver profile found. Contact admin.");
        setLoading(false);
        return;
      }

      if (!driver.is_active) {
        toast.error("Your account has been deactivated. Contact admin.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Clear any stale role cookie from a previous session
      document.cookie = "tko-role=; path=/; max-age=0";
      // Set the correct role cookie immediately
      document.cookie = `tko-role=${driver.role}; path=/; max-age=60; samesite=lax`;
      router.push(getRoleRedirectPath(driver.role as UserRole));
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 via-background to-background px-4">
      <Card className="w-full max-w-md animate-scale-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Top Kim Oil"
              width={80}
              height={80}
              className="rounded-full object-contain shadow-sm"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-primary">
              TKO Central
            </CardTitle>
            <CardDescription>
              Top Kim Oil Sdn. Bhd.
            </CardDescription>
          </div>
          <div className="h-1 w-16 mx-auto rounded-full bg-accent" />
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@topkim.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold active:scale-[0.98] transition-transform"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
