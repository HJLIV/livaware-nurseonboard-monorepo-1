import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  ScrollText,
  BookOpen,
  Sun,
  Moon,
  LogOut,
  UserCheck,
  Stethoscope,
  BarChart3,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const platformItems: NavItem[] = [
  { label: "Dashboard",   href: "/",            icon: LayoutDashboard },
  { label: "Candidates",  href: "/candidates",  icon: Users },
  { label: "Pipeline",    href: "/pipeline",    icon: GitBranch },
];

const moduleItems: NavItem[] = [
  { label: "Preboard",        href: "/preboard",           icon: ClipboardCheck },
  { label: "Onboard",         href: "/nurses",             icon: ShieldCheck },
  { label: "Skills Arcade",   href: "/arcade",             icon: Gamepad2 },
];

const arcadeItems: NavItem[] = [
  { label: "Nurse View",      href: "/arcade",                    icon: Stethoscope },
  { label: "Trainer Queue",   href: "/arcade/trainer",            icon: UserCheck },
  { label: "Modules",         href: "/arcade/admin/modules",      icon: Shield, adminOnly: true },
  { label: "Reports",         href: "/arcade/admin/reports",      icon: BarChart3, adminOnly: true },
  { label: "Users",           href: "/arcade/admin/users",        icon: Users, adminOnly: true },
];

const systemItems: NavItem[] = [
  { label: "Audit Trail", href: "/audit", icon: ScrollText, adminOnly: true },
  { label: "Admin Guide", href: "/guide", icon: BookOpen },
];

function NavSection({
  title,
  items,
  currentPath,
  role,
}: {
  title: string;
  items: NavItem[];
  currentPath: string;
  role?: string;
}) {
  const filtered = items.filter((item) => !item.adminOnly || role === "admin");
  if (filtered.length === 0) return null;

  return (
    <div className="mb-5">
      <p className="px-3 mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 select-none">
        {title}
      </p>
      <nav className="flex flex-col gap-0.5">
        {filtered.map((item) => {
          const isActive =
            item.href === "/" ? currentPath === "/" : currentPath.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer",
                  isActive
                    ? "bg-primary/12 text-primary nav-active-indicator"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-200",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground/60 group-hover:text-sidebar-foreground/80",
                  )}
                />
                <span className="flex-1 tracking-tight">{item.label}</span>
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function SidebarNav() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const { data: authData, isLoading } = useQuery<{
    authenticated: boolean;
    username: string;
    role?: string;
  } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
    retry: false,
  });

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      window.location.href = "/";
    } catch {
      window.location.href = "/";
    }
  };

  const initials = authData?.username
    ? authData.username.slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">

      {/* ── Logo ── */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-sidebar-border/60">
        <img src="/images/livaware-logo-white.png" alt="Livaware" className="h-7 w-auto brightness-90" />
      </div>

      {/* ── Navigation ── */}
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavSection title="Platform" items={platformItems} currentPath={location} role={authData?.role} />
        <NavSection title="Modules"  items={moduleItems}  currentPath={location} role={authData?.role} />
        {location.startsWith("/arcade") && (
          <NavSection title="Arcade" items={arcadeItems} currentPath={location} role={authData?.role} />
        )}
        <NavSection title="System"   items={systemItems}  currentPath={location} role={authData?.role} />
      </div>

      {/* ── Bottom ── */}
      <div className="border-t border-sidebar-border/60 p-3 space-y-1">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-200"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          <span className="font-medium">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>

        {/* User row */}
        {!isLoading && authData?.authenticated && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent/40 transition-all duration-200 group">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 ring-1 ring-primary/30 text-[11px] font-bold text-primary">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">
                {authData.username}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize tracking-wide">
                {authData.role ?? "user"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
