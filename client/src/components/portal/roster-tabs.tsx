import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { CalendarDays, CalendarCheck } from "lucide-react";

/**
 * Pill switcher between the two Roster surfaces. The portal's primary nav
 * only has a single "Roster" tab (which lands on My Availability), so this
 * is the way nurses reach My Shifts.
 */
export function RosterTabs({ active }: { active: "availability" | "my-shifts" }) {
  const tabs = [
    { key: "availability", label: "My Availability", href: "/portal/availability", icon: CalendarDays },
    { key: "my-shifts", label: "My Shifts", href: "/portal/my-shifts", icon: CalendarCheck },
  ] as const;

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1" role="tablist" aria-label="Roster pages">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`tab-roster-${t.key}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
