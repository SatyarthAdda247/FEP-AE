"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Trophy, LayoutList, Archive, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

/**
 * Mobile-only bottom tab bar. The top nav's inline links are hidden on small
 * screens (they overflowed); this gives big, thumb-friendly nav targets with
 * icon + label instead.
 */
export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const isManager = role === "eduskill_manager" || role === "eduskill_admin" || role === "eduskill_viewer";
  const dashHref = isManager ? "/manager" : "/faculty";

  const items = [
    { href: dashHref, label: "Dashboard", icon: LayoutDashboard },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/scoreboard", label: "Scores", icon: LayoutList },
    { href: "/archive", label: "Archive", icon: Archive },
    ...(role === "eduskill_admin" ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === dashHref && pathname.startsWith(dashHref));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[60px] text-[11px] font-medium transition-colors",
                active ? "text-fg" : "text-fg-muted"
              )}
            >
              <Icon className={cn("h-6 w-6", active && "text-fg")} strokeWidth={active ? 2.4 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
