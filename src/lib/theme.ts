import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "csc.theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.style.colorScheme = t;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);
  const toggle = () => {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next);
      applyTheme(next);
      return next;
    });
  };
  return { theme, toggle };
}

// Inline script string for pre-hydration theme set (avoids flash).
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${KEY}');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){}})();`;
