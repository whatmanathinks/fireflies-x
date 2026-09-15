"use client";

import {
  BarChart3,
  CalendarCheck,
  Home,
  ListChecks,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/askfred", label: "AskFred", icon: Sparkles, hint: "⌘J" },
  { href: "/meetings", label: "Meetings", icon: CalendarCheck },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/search", label: "Search", icon: Search },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav className="flex w-[60px] shrink-0 flex-col items-center gap-0.5 border-r border-line bg-white py-3">
      <Link href="/home" className="mb-3 flex size-9 items-center justify-center">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-[15px] font-bold text-white">
          F
        </span>
      </Link>
      {NAV.map(({ href, label, icon: Icon, hint }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Tooltip
            key={href}
            side="right"
            content={
              <span className="flex items-center gap-1.5">
                {label}
                {hint && <span className="text-ink-400">{hint}</span>}
              </span>
            }
          >
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-400 hover:bg-ink-100 hover:text-ink-700",
              )}
            >
              <Icon className="size-[18px]" />
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}
