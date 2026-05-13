import { useEffect, useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "sidebar-rail-collapsed";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav collapsed={collapsed} onToggleCollapsed={toggle} />
      <main
        id="main-content"
        className={cn("transition-[padding] duration-200 ease-in-out", collapsed ? "pl-16" : "pl-64")}
      >
        <div className="px-8 py-8 max-w-[1400px]">
          {children}
        </div>
      </main>
    </div>
  );
}
