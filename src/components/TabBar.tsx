import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ScanLine, Store, Bell, Settings } from "lucide-react";
import type { ComponentType } from "react";

type Tab = { to: string; label: string; Icon: ComponentType<{ className?: string }> };

const TABS: Tab[] = [
  { to: "/home",     label: "Home",   Icon: Home },
  { to: "/scan",     label: "Scan",   Icon: ScanLine },
  { to: "/shop",     label: "Shop",   Icon: Store },
  { to: "/alerts",   label: "Alerts", Icon: Bell },
  { to: "/settings", label: "Me",     Icon: Settings },
];

export function TabBar() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="milled-edge h-[2px] w-full opacity-60" />
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 py-1.5">
        {TABS.map(({ to, label, Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={`group flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`size-5 transition-transform ${active ? "scale-110" : ""}`} />
                <span className="text-[10px] font-medium uppercase tracking-[0.12em]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
