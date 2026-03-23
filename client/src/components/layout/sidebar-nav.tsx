import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  ScrollText,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const platformItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Nurses", href: "/nurses", icon: Users },
  { label: "Pipeline", href: "/pipeline", icon: GitBranch },
];

const moduleItems: NavItem[] = [
  { label: "Preboard", href: "/preboard", icon: ClipboardCheck },
  { label: "Onboard", href: "/onboard", icon: ShieldCheck },
  { label: "Skills Arcade", href: "/skills-arcade", icon: Gamepad2 },
];

const systemItems: NavItem[] = [
  { label: "Audit Trail", href: "/audit", icon: ScrollText, adminOnly: true },
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
  const filtered = items.filter(
    (item) => !item.adminOnly || role === "admin",
  );

  if (filtered.length === 0) return null;

  return (
    <div className="mb-2">
      <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {title}
      </p>
      <nav className="flex flex-col gap-0.5">
        {filtered.map((item) => {
          const isActive =
            item.href === "/"
              ? currentPath === "/"
              : currentPath.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all cursor-pointer",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground/70",
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {isActive && (
                  <ChevronRight className="h-3 w-3 text-primary/60" />
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

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">L</span>
        </div>
        <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
          Livaware
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection
          title="Platform"
          items={platformItems}
          currentPath={location}
          role={authData?.role}
        />
        <NavSection
          title="Modules"
          items={moduleItems}
          currentPath={location}
          role={authData?.role}
        />
        <NavSection
          title="System"
          items={systemItems}
          currentPath={location}
          role={authData?.role}
        />
      </div>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border p-3">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="mb-2 w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          <span className="text-sm">
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </span>
        </Button>

        <Separator className="mb-2 bg-sidebar-border" />

        {/* User info */}
        {isLoading ? (
          <div className="flex items-center gap-3 px-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : authData?.authenticated ? (
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {authData.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {authData.username}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {authData.role || "user"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
