"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { DriverProfile, UserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface AuthContextValue {
  user: User | null;
  driverProfile: DriverProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  driverProfile: null,
  role: null,
  isLoading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUser(user);
        const { data } = await supabase
          .from("drivers")
          .select("id, name, email, phone, role, is_active")
          .eq("auth_user_id", user.id)
          .single();
        if (data) setDriverProfile(data as DriverProfile);
      }
      setIsLoading(false);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: string, session: { user: import("@supabase/supabase-js").User } | null) => {
      if (session?.user) {
        // Only re-fetch profile if user changed (not on token refresh)
        setUser((prev) => {
          if (prev?.id === session.user.id) return prev;
          // Different user — fetch profile
          supabase
            .from("drivers")
            .select("id, name, email, phone, role, is_active")
            .eq("auth_user_id", session.user.id)
            .single()
            .then(({ data }: { data: DriverProfile | null }) => {
              if (data) setDriverProfile(data as DriverProfile);
            });
          return session.user;
        });
      } else {
        setUser(null);
        setDriverProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await supabase.auth.signOut();
    // Clear cached role cookie
    document.cookie = "tko-role=; path=/; max-age=0";
    setUser(null);
    setDriverProfile(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        driverProfile,
        role: driverProfile?.role ?? null,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
