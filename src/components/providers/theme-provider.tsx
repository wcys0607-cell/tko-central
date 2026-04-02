"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    let resolved: "light" | "dark";

    if (t === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else {
      resolved = t;
    }

    root.classList.toggle("dark", resolved === "dark");
    setResolvedTheme(resolved);
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      localStorage.setItem("tko-theme", t);
      applyTheme(t);
    },
    [applyTheme]
  );

  useEffect(() => {
    const saved = localStorage.getItem("tko-theme") as Theme | null;
    const initial = saved ?? "light";
    setThemeState(initial);
    applyTheme(initial);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if ((localStorage.getItem("tko-theme") ?? "system") === "system") {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyTheme]);

  return (
    <ThemeContext value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext>
  );
}
