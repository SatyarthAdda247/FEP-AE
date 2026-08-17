"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function persist(theme: Theme) {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem("eduskill_theme", theme);
  } catch {}
  // 1-year cookie so the server-rendered layout picks the right theme on next request
  document.cookie = `eduskill_theme=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function ThemeProvider({
  children,
  initialTheme = "light",
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    persist(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState(p => (p === "dark" ? "light" : "dark")),
    []
  );

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be inside ThemeProvider");
  return c;
}
