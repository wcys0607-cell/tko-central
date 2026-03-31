"use client";

import {
  createContext,
  useContext,
  useEffect,
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
  const supabase = createClient();

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
        setUser(session.user);
        const { data } = await supabase
          .from("drivers")
          .select("id, name, email, phone, role, is_active")
          .eq("auth_user_id", session.user.id)
          .single();
        if (data) setDriverProfile(data as DriverProfile);
      } else {
        setUser(null);
        setDriverProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await supabase.auth.signOut();
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
