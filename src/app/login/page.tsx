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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
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
        setError("No driver profile found. Contact admin.");
        setLoading(false);
        return;
      }

      if (!driver.is_active) {
        setError("Your account has been deactivated. Contact admin.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      router.push(getRoleRedirectPath(driver.role as UserRole));
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex items-center justify-center">
            <Image
              src="/logo.jpeg"
              alt="Top Kim Oil"
              width={80}
              height={80}
              className="rounded-lg object-contain"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-[#1A3A5C]">
              TKO Central
            </CardTitle>
            <CardDescription>
              Top Kim Oil Sdn. Bhd.
            </CardDescription>
          </div>
          <div className="h-1 w-16 mx-auto rounded bg-[#E8A020]" />
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
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full bg-[#1A3A5C] hover:bg-[#15304D]"
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
