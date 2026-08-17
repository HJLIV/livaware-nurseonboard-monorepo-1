import { useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/theme-provider";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  ClipboardCheck,
  ShieldCheck,
  ScrollText,
  BookOpen,
  Settings,
  Sun,
  Moon,
  LogOut,
  UserCheck,
  BarChart3,
  Shield,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserCog,
  FileText,
  GraduationCap,
  Award,
  TableProperties,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Megaphone,
  CalendarDays,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  requiredRoles?: string[];
  badgeKey?: string;
  variant?: "default" | "action";
}

interface NavSectionDef {
  key: string;
  title: string;
  items: NavItem[];
  prominent?: boolean;
}

const sections: NavSectionDef[] = [
  {
    key: "overview",
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Pipeline", href: "/pipeline", icon: GitBranch },
    ],
  },
  {
    key: "action-needed",
    title: "Action needed",
    prominent: true,
    items: [
      {
        label: "Documents to review",
        href: "/documents/review",
        icon: AlertTriangle,
        adminOnly: true,
        badgeKey: "documentsReview",
        variant: "action",
      },
      {
        label: "Trainer queue",
        href: "/arcade/trainer",
        icon: UserCheck,
        requiredRoles: ["trainer", "admin"],
        badgeKey: "trainerQueue",
        variant: "action",
      },
    ],
  },
  {
    key: "people",
    title: "People & Invoicing",
    items: [
      { label: "Nurses", href: "/nurses", icon: Users },
      { label: "Invoices", href: "/reports/invoices", icon: FileText, adminOnly: true },
    ],
  },
  {
    key: "reports",
    title: "Reports",
    items: [
      {
        label: "Completion overview",
        href: "/reports/completion",
        icon: Activity,
        adminOnly: true,
      },
      {
        label: "Onboarding matrix",
        href: "/reports/onboarding",
        icon: TableProperties,
        adminOnly: true,
      },
      {
        label: "Training matrix",
        href: "/reports/training",
        icon: GraduationCap,
        adminOnly: true,
      },
      {
        label: "Competency matrix",
        href: "/reports/competency",
        icon: Award,
        adminOnly: true,
      },
      {
        label: "Declarations matrix",
        href: "/reports/declarations",
        icon: ClipboardCheck,
        adminOnly: true,
      },
      {
        label: "SOP comprehension",
        href: "/reports/sop-comprehension",
        icon: BookOpen,
        adminOnly: true,
      },
      {
        label: "Availability matrix",
        href: "/reports/availability",
        icon: CalendarDays,
        adminOnly: true,
      },
      {
        label: "Skills Arcade reports",
        href: "/arcade/admin/reports",
        icon: BarChart3,
        adminOnly: true,
      },
      {
        label: "Internal training",
        href: "/reports/internal-training",
        icon: GraduationCap,
        adminOnly: true,
      },
    ],
  },
  {
    key: "rostering",
    title: "Rostering",
    items: [
      { label: "Patients", href: "/rostering/patients", icon: Users, adminOnly: true },
      { label: "Patient Rota", href: "/rostering/rota", icon: CalendarDays, adminOnly: true },
    ],
  },
  {
    key: "governance",
    title: "Governance & system",
    items: [
      {
        label: "Activity dashboard",
        href: "/super-admin/activity",
        icon: Activity,
        superAdminOnly: true,
      },
      {
        label: "Mass email",
        href: "/super-admin/mass-email",
        icon: Megaphone,
        superAdminOnly: true,
      },
      { label: "Documents", href: "/documents", icon: FileText, adminOnly: true },
      { label: "Audit trail", href: "/audit", icon: ScrollText, adminOnly: true },
      { label: "Policies", href: "/admin/policies", icon: FileText, adminOnly: true },
      { label: "Reading materials", href: "/admin/reading-materials", icon: BookOpen, adminOnly: true },
      {
        label: "Skills Arcade modules",
        href: "/arcade/admin/modules",
        icon: Shield,
        adminOnly: true,
      },
      {
        label: "User management",
        href: "/arcade/admin/users",
        icon: UserCog,
        adminOnly: true,
      },
      { label: "Platform settings", href: "/settings", icon: Settings, adminOnly: true },
      { label: "Admin guide", href: "/guide", icon: BookOpen },
    ],
  },
];

const STORAGE_KEY = "sidebar-collapsed-sections";

function loadCollapsed(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCollapsed(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function isItemActive(item: NavItem, currentPath: string, currentSearch: string, allFiltered: NavItem[]) {
  const [itemPath, itemQuery = ""] = item.href.split("?");
  const itemStage = new URLSearchParams(itemQuery).get("stage");

  if (itemPath === "/nurses") {
    if (currentPath !== "/nurses" && !currentPath.startsWith("/nurses/")) return false;
    const currentStage = new URLSearchParams(currentSearch).get("stage");
    if (itemStage) return currentStage === itemStage;
    return currentPath === "/nurses" && !currentStage;
  }

  const specificRoutes = ["/arcade/trainer", "/arcade/admin/modules", "/arcade/admin/reports", "/arcade/admin/users"];
  const longerSiblingMatches = allFiltered.some((other) => {
    const [otherPath] = other.href.split("?");
    return (
      other.href !== item.href &&
      otherPath.length > itemPath.length &&
      otherPath.startsWith(itemPath) &&
      (currentPath === otherPath || currentPath.startsWith(otherPath + "/"))
    );
  });
  return itemPath === "/"
    ? currentPath === "/"
    : itemPath === "/arcade"
      ? currentPath.startsWith("/arcade") && !specificRoutes.some((r) => currentPath.startsWith(r))
      : !longerSiblingMatches && currentPath.startsWith(itemPath);
}

function SuperAdminChip() {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-300"
      title="Super admin only"
    >
      <ShieldAlert className="h-2 w-2" />
      SA
    </span>
  );
}

function NavSection({
  section,
  currentPath,
  currentSearch,
  role,
  collapsed,
  onToggle,
  badges,
}: {
  section: NavSectionDef;
  currentPath: string;
  currentSearch: string;
  role?: string;
  collapsed: boolean;
  onToggle: () => void;
  badges: Record<string, number>;
}) {
  const filtered = section.items.filter((item) => {
    if (item.adminOnly && role !== "admin" && role !== "super_admin") return false;
    if (item.superAdminOnly && role !== "super_admin") return false;
    if (item.requiredRoles && (!role || !item.requiredRoles.includes(role))) return false;
    return true;
  });
  if (filtered.length === 0) return null;

  const panelId = `nav-panel-${section.key}`;
  const prominent = !!section.prominent;

  return (
    <div className={cn("mb-2", prominent && "rounded-lg bg-primary/[0.04] ring-1 ring-primary/15 px-1.5 py-1.5 mb-3")}> 
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={panelId}
        className={cn(
          "w-full flex items-center justify-between px-2 mb-1 py-1 rounded-md hover:bg-sidebar-accent/30 transition-colors duration-150 group",
          prominent && "px-1.5",
        )}
      >
        <span
          className={cn(
            "text-[9px] font-bold uppercase tracking-[0.18em] select-none transition-colors flex items-center gap-1.5",
            prominent
              ? "text-primary/80 group-hover:text-primary"
              : "text-muted-foreground/50 group-hover:text-muted-foreground/70",
          )}
        >
          {prominent && <Inbox className="h-3 w-3" />}
          {section.title}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            prominent
              ? "text-primary/60 group-hover:text-primary"
              : "text-muted-foreground/40 group-hover:text-muted-foreground/60",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={section.title}
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          collapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100",
        )}
        aria-hidden={collapsed}
        style={collapsed ? { pointerEvents: "none" as const } : undefined}
      >
        <nav className="flex flex-col gap-0.5">
          {filtered.map((item) => {
            const isActive = isItemActive(item, currentPath, currentSearch, filtered);
            const Icon = item.icon;
            const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined;
            const isAction = item.variant === "action";
            const hasOutstanding = badgeCount !== undefined && badgeCount > 0;

            return (
              <Link key={item.href} href={item.href} tabIndex={collapsed ? -1 : undefined}>
                <div
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-primary/12 text-primary nav-active-indicator"
                      : isAction && hasOutstanding
                        ? "text-foreground hover:bg-primary/10"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors duration-200",
                      isActive
                        ? "text-primary"
                        : isAction && hasOutstanding
                          ? "text-primary/80"
                          : "text-muted-foreground/60 group-hover:text-sidebar-foreground/80",
                    )}
                  />
                  <span className="flex-1 tracking-tight truncate">{item.label}</span>
                  {item.superAdminOnly && <SuperAdminChip />}
                  {badgeCount !== undefined && badgeCount > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold leading-none tabular-nums",
                        isAction
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/15 text-primary",
                      )}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function CollapsedNavItem({
  item,
  currentPath,
  currentSearch,
  filteredSiblings,
  badges,
}: {
  item: NavItem;
  currentPath: string;
  currentSearch: string;
  filteredSiblings: NavItem[];
  badges: Record<string, number>;
}) {
  const isActive = isItemActive(item, currentPath, currentSearch, filteredSiblings);
  const Icon = item.icon;
  const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={item.href}>
          <div
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 cursor-pointer",
              isActive
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
            data-testid={`nav-rail-${item.href}`}
          >
            <Icon className="h-4 w-4" />
            {badgeCount !== undefined && badgeCount > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold leading-none ring-2 ring-sidebar tabular-nums bg-primary text-primary-foreground"
              >
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
            {item.superAdminOnly && (
              <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[7px] font-bold text-white ring-1 ring-sidebar">
                <ShieldAlert className="h-2 w-2" />
              </span>
            )}
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {item.label}
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="ml-1.5 text-muted-foreground">({badgeCount})</span>
        )}
        {item.superAdminOnly && (
          <span className="ml-1.5 text-amber-400 text-[10px] uppercase tracking-wider">SA</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const [location] = useLocation();
  const locationSearch = useSearch();
  const { theme, toggleTheme } = useTheme();
  const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>(loadCollapsed);

  const toggleSection = (key: string) => {
    setCollapsedState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsed(next);
      return next;
    });
  };

  const { data: authData, isLoading } = useQuery<{
    authenticated: boolean;
    username: string;
    role?: string;
    email?: string;
    displayName?: string;
    authMethod?: "local" | "microsoft";
  } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
    retry: false,
  });

  const { data: statsData } = useQuery<{
    funnelCounts?: { preboard?: number };
  } | null>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 30000,
    retry: false,
  });

  const { data: trainerData } = useQuery<Record<string, unknown>[] | null>({
    queryKey: ["/api/trainer/remediation-queue"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 30000,
    retry: false,
    enabled: authData?.role === "trainer" || authData?.role === "admin",
  });

  const { data: reviewQueueData } = useQuery<{ total: number } | null>({
    queryKey: ["/api/admin/documents/review-queue"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 30000,
    retry: false,
    enabled: authData?.role === "admin",
  });

  const badges: Record<string, number> = {
    applicants: statsData?.funnelCounts?.preboard ?? 0,
    trainerQueue: Array.isArray(trainerData) ? trainerData.length : 0,
    documentsReview: reviewQueueData?.total ?? 0,
  };

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

  const role = authData?.role;
  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.adminOnly && role !== "admin" && role !== "super_admin") return false;
        if (item.superAdminOnly && role !== "super_admin") return false;
        if (item.requiredRoles && (!role || !item.requiredRoles.includes(role))) return false;
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-64",
        )}
        data-testid="sidebar-nav"
        data-collapsed={collapsed}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border/60",
            collapsed ? "justify-center px-2" : "gap-3 px-5",
          )}
        >
          {collapsed ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary text-sm font-bold ring-1 ring-primary/25">
              L
            </div>
          ) : (
            <>
              <img src="/images/livaware-logo-white.png" alt="Basecamp by Livaware" className="h-7 w-auto brightness-90" />
              <div className="h-5 w-px bg-sidebar-border" aria-hidden="true" />
              <p className="whitespace-nowrap text-[11px] font-medium tracking-[0.14em] uppercase text-primary">Basecamp</p>
            </>
          )}
        </div>

        {onToggleCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={collapsed}
                data-testid="button-sidebar-collapse"
                className="absolute -right-3 top-20 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar shadow-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        )}

        <div className={cn("flex-1 overflow-y-auto py-5", collapsed ? "px-2" : "px-3")}>
          {collapsed ? (
            <nav className="flex flex-col items-center gap-1">
              {filteredSections.map((section, idx) => (
                <div key={section.key} className="flex flex-col items-center gap-1 w-full">
                  {idx > 0 && <div className="h-px w-6 bg-sidebar-border/40 my-1" />}
                  {section.items.map((item) => (
                    <CollapsedNavItem
                      key={`${section.key}-${item.href}-${item.label}`}
                      item={item}
                      currentPath={location}
                      currentSearch={locationSearch}
                      filteredSiblings={section.items}
                      badges={badges}
                    />
                  ))}
                </div>
              ))}
            </nav>
          ) : (
            sections.map((section) => (
              <NavSection
                key={section.key}
                section={section}
                currentPath={location}
                currentSearch={locationSearch}
                role={role}
                collapsed={!!collapsedState[section.key]}
                onToggle={() => toggleSection(section.key)}
                badges={badges}
              />
            ))
          )}
        </div>

        <div className={cn("border-t border-sidebar-border/60 space-y-1", collapsed ? "p-2" : "p-3")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-center h-10 rounded-lg text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-200"
                  data-testid="button-theme-rail"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </TooltipContent>
            </Tooltip>
          ) : (
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
          )}

          {!isLoading && authData?.authenticated && (
            collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center h-10 rounded-lg group hover:bg-sidebar-accent/60 transition-all duration-200"
                    data-testid="button-user-rail"
                    title="Sign out"
                  >
                    <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 ring-1 ring-primary/30 text-[10px] font-bold text-primary">
                      {initials}
                      {authData.role === "super_admin" && (
                        <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[7px] font-bold text-white ring-1 ring-sidebar">
                          <ShieldAlert className="h-2 w-2" />
                        </span>
                      )}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  <div className="flex flex-col">
                    <span>{authData.displayName || authData.username}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {authData.role === "super_admin" ? "super admin" : authData.role ?? "user"} · click to sign out
                    </span>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent/40 transition-all duration-200 group">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 ring-1 ring-primary/30 text-[11px] font-bold text-primary">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">
                    {authData.displayName || authData.username}
                  </p>
                  <p className="text-[10px] text-muted-foreground tracking-wide flex items-center gap-1.5 flex-wrap">
                    {authData.authMethod === "microsoft" ? (
                      <span className="inline-flex items-center gap-1">
                        <svg viewBox="0 0 21 21" className="h-2.5 w-2.5 inline-block shrink-0"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                        Microsoft · {(authData.role === "super_admin" ? "super admin" : authData.role ?? "user")}
                      </span>
                    ) : (
                      <span className="capitalize">
                        {authData.role === "super_admin" ? "super admin" : authData.role ?? "user"}
                      </span>
                    )}
                    {authData.role === "super_admin" && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-sm bg-amber-500/15 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-300"
                        data-testid="badge-sidebar-super-admin"
                      >
                        <ShieldAlert className="h-2 w-2" />
                        SA
                      </span>
                    )}
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
            )
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
