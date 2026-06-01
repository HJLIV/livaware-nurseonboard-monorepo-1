import { useMemo, type ReactNode, type ComponentType } from "react";
import { Link, useLocation } from "wouter";
import {
  Check,
  Clock,
  ChevronRight,
  Lock,
  Circle,
  ClipboardCheck,
  ShieldCheck,
  BookOpenCheck,
  GraduationCap,
  Home,
  AlertCircle,
  CalendarDays,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_STATUS, PORTAL_STEPS, ASSESSMENT_HOISTED_STEP_KEYS } from "@shared/schema";

// ─── Public types (kept stable for backwards compatibility) ─────────────

export type PortalItemStatus =
  | "completed"
  | "awaiting_verification"
  | "in_progress"
  | "pending"
  | "locked"
  | "coming_soon"
  | "not_started";

export interface PortalSidebarItem {
  key: string;
  label: string;
  status: PortalItemStatus;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}

export interface PortalSidebarGroup {
  key: string;
  title: string;
  icon?: ReactNode;
  items: PortalSidebarItem[];
  emptyMessage?: string;
  defaultOpen?: boolean;
}

export interface PortalToDoCounts {
  documents: number;
  training: number;
  references: number;
  missingDocumentLabels?: string[];
}

interface PortalShellProps {
  token: string;
  candidateName: string;
  groups: PortalSidebarGroup[];
  activeKey: string;
  onItemSelect?: (item: PortalSidebarItem) => void;
  todoCounts?: PortalToDoCounts;
  children: ReactNode;
}

// ─── Status helpers ─────────────────────────────────────────────────────

const STAGE_ORDER: PortalItemStatus[] = [
  "in_progress",
  "pending",
  "awaiting_verification",
  "completed",
  "locked",
  "coming_soon",
];

export function normalizeStatus(raw: string | null | undefined): PortalItemStatus {
  if (!raw) return "pending";
  switch (raw) {
    case STEP_STATUS.completed:
    case "cleared":
    case "competent":
      return "completed";
    case STEP_STATUS.awaiting_verification:
      return "awaiting_verification";
    case STEP_STATUS.in_progress:
      return "in_progress";
    case "locked":
      return "locked";
    case "coming_soon":
      return "coming_soon";
    case STEP_STATUS.pending:
    case STEP_STATUS.failed:
    case "not_started":
    default:
      return "pending";
  }
}

function StatusDot({ status }: { status: PortalItemStatus }) {
  if (status === "completed") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (status === "awaiting_verification") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
        <Clock className="h-3 w-3" />
      </span>
    );
  }
  if (status === "locked") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
        <Lock className="h-3 w-3" />
      </span>
    );
  }
  if (status === "coming_soon") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground/40">
        <Circle className="h-2 w-2" />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Circle className="h-2 w-2 fill-current" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground/50">
      <Circle className="h-2 w-2" />
    </span>
  );
}

function StatusChip({ status }: { status: PortalItemStatus }) {
  const base = "text-[10px] font-medium uppercase tracking-wider rounded-full px-2 py-0.5";
  switch (status) {
    case "completed":
      return <span className={cn(base, "bg-emerald-500/10 text-emerald-500")}>Done</span>;
    case "awaiting_verification":
      return <span className={cn(base, "bg-amber-500/10 text-amber-500")}>Pending review</span>;
    case "in_progress":
      return <span className={cn(base, "bg-primary/10 text-primary")}>In progress</span>;
    case "locked":
      return <span className={cn(base, "bg-muted text-muted-foreground/70")}>Locked</span>;
    case "coming_soon":
      return <span className={cn(base, "border border-dashed border-muted-foreground/30 text-muted-foreground/60")}>Coming soon</span>;
    default:
      return <span className={cn(base, "border border-border text-muted-foreground/70")}>Not started</span>;
  }
}

// ─── Primary navigation definition ──────────────────────────────────────
//
// The portal exposes a single 4–5 item primary nav. Each entry maps to a
// group produced by buildPortalGroups so we can compute a per-tab badge
// (number of outstanding items) and resolve which tab is "active" from
// the activeKey prop the page passes in.

interface PrimaryNavDef {
  key: string;
  groupKey: string;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  // Match an item.key (or a literal activeKey) to this primary tab.
  matches: (activeKey: string) => boolean;
}

const PRIMARY_NAV: PrimaryNavDef[] = [
  {
    key: "home",
    groupKey: "overview",
    label: "Home",
    shortLabel: "Home",
    icon: Home,
    href: "/portal",
    matches: (k) => k === "overview" || k === "home",
  },
  {
    key: "assessment",
    groupKey: "assessment",
    label: "Assessment",
    shortLabel: "Assess",
    icon: ClipboardCheck,
    href: "/portal/section/assessment",
    matches: (k) => k.startsWith("assessment:") || k === "assessment",
  },
  {
    key: "compliance",
    groupKey: "onboarding",
    label: "Compliance",
    shortLabel: "Compliance",
    icon: ShieldCheck,
    href: "/portal/section/compliance",
    matches: (k) => k.startsWith("onboard:") || k === "compliance",
  },
  {
    key: "induction",
    groupKey: "induction",
    label: "Induction",
    shortLabel: "Induction",
    icon: BookOpenCheck,
    href: "/portal/section/induction",
    matches: (k) => k.startsWith("induction:") || k === "induction",
  },
  {
    key: "training",
    groupKey: "training",
    label: "Training",
    shortLabel: "Training",
    icon: GraduationCap,
    href: "/portal/section/training",
    matches: (k) => k.startsWith("training:") || k === "training",
  },
  {
    key: "roster",
    groupKey: "rostering",
    label: "Roster",
    shortLabel: "Roster",
    icon: CalendarDays,
    href: "/portal/availability",
    matches: (k) => k.startsWith("rostering:") || k === "roster",
  },
  {
    key: "finance",
    groupKey: "finance",
    label: "Finance",
    shortLabel: "Finance",
    icon: FileText,
    href: "/portal/invoices",
    matches: (k) => k.startsWith("finance:") || k === "finance",
  },
];

function countOutstanding(items: PortalSidebarItem[]): number {
  return items.filter(
    (i) =>
      i.status !== "completed" &&
      i.status !== "locked" &&
      i.status !== "coming_soon",
  ).length;
}

interface ActiveNavMeta {
  tabKey: string;
  group?: PortalSidebarGroup;
  item?: PortalSidebarItem;
}

function resolveActiveNav(
  groups: PortalSidebarGroup[],
  activeKey: string,
  pathname: string,
): ActiveNavMeta {
  // Prefer URL-based matching for the nav's own routes so detail pages
  // light up the right tab even when activeKey is something bespoke.
  if (pathname === "/portal" || pathname === "/portal/")
    return { tabKey: "home", group: groups.find((g) => g.key === "overview") };
  if (pathname.startsWith("/portal/section/assessment"))
    return { tabKey: "assessment", group: groups.find((g) => g.key === "assessment") };
  if (pathname.startsWith("/portal/section/compliance"))
    return { tabKey: "compliance", group: groups.find((g) => g.key === "onboarding") };
  if (pathname.startsWith("/portal/section/induction"))
    return { tabKey: "induction", group: groups.find((g) => g.key === "induction") };
  if (pathname.startsWith("/portal/section/training"))
    return { tabKey: "training", group: groups.find((g) => g.key === "training") };
  if (pathname.startsWith("/portal/availability"))
    return { tabKey: "roster", group: groups.find((g) => g.key === "rostering") };
  if (pathname.startsWith("/portal/invoices"))
    return { tabKey: "finance", group: groups.find((g) => g.key === "finance") };

  // Otherwise, infer from the activeKey using the prefix matcher.
  const def = PRIMARY_NAV.find((d) => d.matches(activeKey));
  if (def) {
    const group = groups.find((g) => g.key === def.groupKey);
    const item = group?.items.find((i) => i.key === activeKey);
    return { tabKey: def.key, group, item };
  }
  return { tabKey: "home", group: groups.find((g) => g.key === "overview") };
}

// ─── Shell ──────────────────────────────────────────────────────────────

export function PortalShell({
  candidateName,
  groups,
  activeKey,
  children,
}: PortalShellProps) {
  const [location] = useLocation();

  const activeNav = useMemo(
    () => resolveActiveNav(groups, activeKey, location),
    [groups, activeKey, location],
  );

  // Build the visible primary nav. Filter out tabs whose group isn't in
  // the supplied groups (e.g. Roster is only present for completed
  // nurses — buildPortalGroups omits it otherwise).
  const navItems = useMemo(() => {
    const all = PRIMARY_NAV.filter((def) =>
      groups.some((g) => g.key === def.groupKey),
    ).map((def) => {
      const group = groups.find((g) => g.key === def.groupKey)!;
      const items = group.items.filter((i) => i.status !== "coming_soon");
      const outstanding = countOutstanding(group.items);
      const allLocked = items.length > 0 && items.every((i) => i.status === "locked");
      const allDone = items.length > 0 && items.every((i) => i.status === "completed");
      return {
        ...def,
        outstanding,
        locked: allLocked,
        allDone,
        active: activeNav.tabKey === def.key,
      };
    });
    // Cap at 6 visible tabs. Always keep Home, Roster + Finance (when
    // present, they are post-completion essentials) and the active tab
    // so the user never loses a critical surface. Beyond that, drop
    // fully-completed sections first; remaining sections stay reachable
    // via /portal/section/:section + the Home journey cards.
    if (all.length <= 6) return all;
    const keep = new Set<string>();
    keep.add("home");
    if (all.some((d) => d.key === "roster")) keep.add("roster");
    if (all.some((d) => d.key === "finance")) keep.add("finance");
    const activeKey = all.find((d) => d.active)?.key;
    if (activeKey) keep.add(activeKey);
    const ordered = [
      ...all.filter((d) => !d.allDone),
      ...all.filter((d) => d.allDone),
    ];
    for (const d of ordered) {
      if (keep.size >= 6) break;
      keep.add(d.key);
    }
    return all.filter((d) => keep.has(d.key));
  }, [groups, activeNav.tabKey]);

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      data-testid="portal-shell"
    >
      <header
        className="sticky top-0 z-40 border-b border-border bg-sidebar/95 backdrop-blur"
        data-testid="portal-shell-header"
      >
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/portal"
            className="flex items-center gap-3 -ml-1 px-1 py-1 rounded-md hover:bg-secondary/40 transition-colors"
            aria-label="Portal home"
            data-testid="portal-shell-home-link"
          >
            <img
              src="/images/livaware-logo-white.png"
              alt="Livaware"
              className="h-6 w-auto"
            />
            <div className="h-5 w-px bg-border" />
            <p className="text-xs font-medium tracking-[0.14em] uppercase text-primary">
              NurseOnboard
            </p>
          </Link>
          <div className="ml-auto flex items-center gap-3 min-w-0">
            <p
              className="text-xs text-muted-foreground/70 truncate hidden sm:block"
              data-testid="portal-shell-candidate-name"
            >
              {candidateName}
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await fetch("/api/portal/auth/sign-out", {
                    method: "POST",
                    credentials: "include",
                  });
                } catch {
                  /* ignore */
                }
                window.location.href = "/portal/sign-in";
              }}
              className="text-xs text-muted-foreground/70 hover:text-foreground underline"
              data-testid="portal-shell-sign-out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex gap-6">
          {/* Desktop: slim left rail */}
          <nav
            aria-label="Portal navigation"
            className="hidden lg:flex flex-col w-20 shrink-0"
            data-testid="portal-shell-rail"
          >
            <div className="sticky top-[5rem] flex flex-col gap-2">
              {navItems.map((nav) => {
                const Icon = nav.icon;
                return (
                  <Link
                    key={nav.key}
                    href={nav.href}
                    aria-label={nav.label}
                    aria-current={nav.active ? "page" : undefined}
                    className={cn(
                      "group relative flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[10px] font-medium tracking-wide uppercase transition-colors",
                      nav.active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground/70 hover:bg-secondary hover:text-foreground",
                    )}
                    data-testid={`portal-nav-${nav.key}`}
                  >
                    <span className="relative">
                      <Icon className="h-5 w-5" />
                      {nav.outstanding > 0 && !nav.active && (
                        <span
                          className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-[9px] font-semibold text-primary-foreground flex items-center justify-center tabular-nums"
                          data-testid={`portal-nav-${nav.key}-badge`}
                        >
                          {nav.outstanding}
                        </span>
                      )}
                      {nav.locked && (
                        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-background flex items-center justify-center">
                          <Lock className="h-2 w-2 text-muted-foreground/70" />
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] leading-tight text-center">
                      {nav.shortLabel}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <main
            id="main-content"
            className="flex-1 min-w-0 pb-24 lg:pb-0"
            data-testid="portal-shell-main"
          >
            {children}
          </main>
        </div>
      </div>

      {/* Mobile: phone-style bottom tab bar. Hidden on desktop where the
          left rail provides the same nav. */}
      <nav
        aria-label="Portal navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-sidebar/95 backdrop-blur supports-[padding:max(0px)]:pb-[env(safe-area-inset-bottom)]"
        data-testid="portal-shell-bottom-nav"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map((nav) => {
            const Icon = nav.icon;
            return (
              <Link
                key={nav.key}
                href={nav.href}
                aria-label={nav.label}
                aria-current={nav.active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors min-h-[56px]",
                  nav.active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`portal-nav-mobile-${nav.key}`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {nav.outstanding > 0 && !nav.active && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-[9px] font-semibold text-primary-foreground flex items-center justify-center tabular-nums"
                    >
                      {nav.outstanding}
                    </span>
                  )}
                  {nav.locked && (
                    <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-background flex items-center justify-center">
                      <Lock className="h-2 w-2 text-muted-foreground/70" />
                    </span>
                  )}
                </span>
                <span className="leading-tight">{nav.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <footer className="border-t border-border bg-card py-4 mt-auto hidden lg:block">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-xs text-muted-foreground text-center">
            Livaware Ltd — Secure Nurse Onboarding Portal
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── PortalSectionChecklist ─────────────────────────────────────────────
//
// Flat checklist used by the new section pages. Renders each item with
// a status chip and a chevron, and surfaces locked/disabled items in a
// muted style.

export function PortalSectionChecklist({
  group,
  emptyMessage,
}: {
  group: PortalSidebarGroup;
  emptyMessage?: string;
}) {
  if (group.items.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground/70 italic px-1"
        data-testid={`portal-section-empty-${group.key}`}
      >
        {emptyMessage || group.emptyMessage || "Nothing here yet"}
      </p>
    );
  }

  return (
    <ul
      className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden"
      data-testid={`portal-section-checklist-${group.key}`}
    >
      {group.items.map((item) => {
        const interactive = !item.disabled;
        const inner = (
          <>
            <StatusDot status={item.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {item.label}
              </p>
              {item.hint && (
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                  {item.hint}
                </p>
              )}
            </div>
            <StatusChip status={item.status} />
            {interactive && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            )}
          </>
        );
        const className = cn(
          "flex items-center gap-3 px-4 py-3 text-left w-full transition-colors",
          interactive
            ? "hover:bg-secondary/40 focus:bg-secondary/60 focus:outline-none"
            : "opacity-60 cursor-not-allowed",
        );
        return (
          <li key={item.key}>
            {!interactive ? (
              <div
                className={className}
                aria-disabled
                data-testid={`portal-section-item-${item.key}`}
              >
                {inner}
              </div>
            ) : item.href && !item.onClick ? (
              <Link
                href={item.href}
                className={className}
                data-testid={`portal-section-item-${item.key}`}
              >
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                className={className}
                onClick={() => item.onClick?.()}
                data-testid={`portal-section-item-${item.key}`}
              >
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Helpers for building groups ────────────────────────────────────────

export interface JourneyData {
  preboard: { status: string; actionUrl?: string; label: string };
  onboard: { status: string; actionUrl?: string; label: string };
  skillsArcade: { status: string; actionUrl?: string; label: string };
}

export interface PortalGateInfo {
  unlocked: boolean;
  mode: "auto" | "manual";
  stageCompleted?: boolean;
  complianceApproved?: boolean;
  prerequisites: {
    examinationCompleted: boolean;
    competencyDeclared: boolean;
    cvReviewed: boolean;
  };
  lockedReason?: string | null;
}

interface BuildGroupsArgs {
  token: string;
  journey: JourneyData;
  stepStatuses: Record<string, string>;
  selectOverview: () => void;
  selectOnboardingStep: (stepKey: string) => void;
  policiesSummary?: { totalRequired: number; outstanding: number } | null;
  selectPolicies?: () => void;
  availabilityEnabled?: boolean;
  selectAvailability?: () => void;
  invoicesEnabled?: boolean;
  selectInvoices?: () => void;
  inductionSummary?: { total: number; outstanding: number; unlocked: boolean } | null;
  selectInduction?: () => void;
  sopComprehensionSummary?: { totalRequired: number; outstanding: number } | null;
  selectSopComprehension?: () => void;
  selectCompetency?: () => void;
  selectCvUpload?: () => void;
  declarationsSummary?: {
    items: { key: string; title: string; status: "not_started" | "draft" | "submitted" | "reopened" }[];
  } | null;
  selectDeclaration?: (key: string) => void;
  gate?: PortalGateInfo | null;
  // Service Agreement (task 170, revised) — surfaced inside the Compliance
  // group as its final item. `undefined` means the hub hasn't reported state
  // yet (item hidden); otherwise it shows locked until the nurse's compliance
  // is admin-approved, then becomes signable, then completed once signed.
  serviceAgreementSigned?: boolean;
  selectServiceAgreement?: () => void;
}

// Additional onboarding declarations the candidate must complete alongside
// the existing PORTAL_STEPS.
export const ADDITIONAL_ONBOARDING_ITEMS: { key: string; name: string }[] = [
  { key: "rehab_of_offenders", name: "Rehabilitation of Offenders Declaration" },
  { key: "occupational_health", name: "Occupational Health Questionnaire" },
  { key: "epp_declaration", name: "Exposure-Prone Procedures (EPP) Declaration" },
  { key: "working_time_directive", name: "European Working Time Directive" },
  { key: "data_protection", name: "Data Protection & Confidentiality" },
  { key: "age_and_eligibility", name: "Age (18+) & Eligibility to Work" },
];

export function buildPortalGroups({
  token,
  journey,
  stepStatuses,
  selectOverview,
  selectOnboardingStep,
  policiesSummary,
  selectPolicies,
  availabilityEnabled,
  selectAvailability,
  invoicesEnabled,
  selectInvoices,
  inductionSummary,
  selectInduction,
  sopComprehensionSummary,
  selectSopComprehension,
  selectCompetency,
  selectCvUpload,
  declarationsSummary,
  selectDeclaration,
  gate,
  serviceAgreementSigned,
  selectServiceAgreement,
}: BuildGroupsArgs): PortalSidebarGroup[] {
  const isLocked = !!gate && gate.unlocked === false;
  const lockedHint = "Locked — finish Assessment first";
  const stageLocked = !!gate && gate.complianceApproved === false;
  const stageLockedHint = "Locked — admin must approve compliance first";

  // Service Agreement (task 170, revised) — no longer a blocking first step.
  // It is the first item of the Induction group and only becomes signable once
  // an admin has approved the nurse's compliance. Before approval it is shown
  // locked; after approval it is actionable; once signed it shows completed.
  const saSigned = serviceAgreementSigned === true;
  const saApproved = gate?.complianceApproved === true;
  const serviceAgreementItem = {
    key: "onboard:service-agreement",
    label: "Service Agreement",
    status: saSigned
      ? ("completed" as PortalItemStatus)
      : saApproved
        ? ("in_progress" as PortalItemStatus)
        : ("locked" as PortalItemStatus),
    disabled: !saSigned && !saApproved,
    hint: saSigned
      ? "Signed"
      : saApproved
        ? "Read & sign your Service Agreement"
        : "Available once your compliance is approved",
    onClick:
      saSigned || saApproved
        ? selectServiceAgreement ??
          (() => {
            window.location.href = `/portal/service-agreement`;
          })
        : undefined,
  };

  const examStatus: PortalItemStatus = gate?.prerequisites.examinationCompleted
    ? "completed"
    : normalizeStatus(journey.preboard.status);
  const competencyStatus: PortalItemStatus = gate?.prerequisites.competencyDeclared
    ? "completed"
    : normalizeStatus(stepStatuses.competency);
  const cvStatus: PortalItemStatus = gate?.prerequisites.cvReviewed
    ? "completed"
    : "in_progress";

  let policiesStatus: PortalItemStatus = "in_progress";
  let policiesHint: string | undefined;
  if (policiesSummary) {
    if (policiesSummary.totalRequired === 0) {
      policiesStatus = "completed";
      policiesHint = "No policies require acknowledgement";
    } else if (policiesSummary.outstanding === 0) {
      policiesStatus = "completed";
      policiesHint = `All ${policiesSummary.totalRequired} acknowledged`;
    } else {
      policiesStatus = "in_progress";
      policiesHint = `${policiesSummary.outstanding} of ${policiesSummary.totalRequired} outstanding`;
    }
  }

  const baseGroups: PortalSidebarGroup[] = [
    {
      key: "overview",
      title: "Welcome",
      icon: <LayoutDashboard className="h-3.5 w-3.5" />,
      defaultOpen: true,
      items: [
        {
          key: "overview",
          label: "Overview",
          status: "in_progress",
          onClick: selectOverview,
          href: "/portal",
        },
      ],
    },
    {
      key: "assessment",
      title: "Assessment",
      icon: <ClipboardCheck className="h-3.5 w-3.5" />,
      defaultOpen: true,
      items: [
        {
          key: "assessment:examination",
          label: "Clinical examination",
          status: examStatus,
          hint:
            examStatus === "completed"
              ? "Submitted"
              : "Short timed clinical & situational quiz",
          onClick: () => {
            const url = journey.preboard.actionUrl || `/preboard/assessment?token=${token}`;
            window.location.href = url;
          },
        },
        {
          key: "assessment:competency",
          label: "Clinical competency",
          status: competencyStatus,
          hint:
            competencyStatus === "completed"
              ? "Self-rating submitted"
              : "Self-rate yourself across nursing domains",
          onClick: selectCompetency
            ? selectCompetency
            : () => {
                window.location.href = `/portal/page?step=competency`;
              },
        },
        {
          key: "assessment:cv",
          label: "CV upload",
          status: cvStatus,
          hint: gate?.prerequisites.cvReviewed
            ? "Reviewed by admin"
            : gate
              ? "Awaiting admin review"
              : "Upload your CV for review",
          onClick: selectCvUpload
            ? selectCvUpload
            : () => {
                window.location.href = `/portal/cv/${token}`;
              },
        },
      ],
    },
    {
      key: "onboarding",
      title: "Compliance",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      defaultOpen: !isLocked,
      items: [
        ...PORTAL_STEPS.filter(
          (step) =>
            !ASSESSMENT_HOISTED_STEP_KEYS.includes(step.key) &&
            step.key !== "equal_opportunities" &&
            // Mandatory Training is not a Compliance prerequisite — it
            // belongs in the Induction & Training group below.
            step.key !== "training",
        ).map((step) => {
          const label = step.key === "identity" ? "Demographics" : step.name;
          const ageDecl = declarationsSummary?.items.find(
            (d) => d.key === "age_and_eligibility",
          );
          const ohDecl = declarationsSummary?.items.find(
            (d) => d.key === "occupational_health",
          );
          let derivedStatus: PortalItemStatus;
          if (step.key === "right_to_work") {
            derivedStatus =
              ageDecl?.status === "submitted"
                ? "completed"
                : ageDecl?.status === "draft" || ageDecl?.status === "reopened"
                  ? "in_progress"
                  : normalizeStatus(stepStatuses.right_to_work);
          } else if (step.key === "health") {
            derivedStatus =
              ohDecl?.status === "submitted"
                ? "completed"
                : ohDecl?.status === "draft" || ohDecl?.status === "reopened"
                  ? "in_progress"
                  : normalizeStatus(stepStatuses.health);
          } else {
            derivedStatus = normalizeStatus(stepStatuses[step.key]);
          }
          let onClick: (() => void) | undefined;
          if (isLocked) {
            onClick = undefined;
          } else if (step.key === "right_to_work" && selectDeclaration) {
            onClick = () => selectDeclaration("age_and_eligibility");
          } else if (step.key === "health" && selectDeclaration) {
            onClick = () => selectDeclaration("occupational_health");
          } else {
            onClick = () => selectOnboardingStep(step.key);
          }
          return {
            key: `onboard:${step.key}`,
            label,
            status: isLocked ? ("locked" as PortalItemStatus) : derivedStatus,
            disabled: isLocked,
            hint: isLocked ? lockedHint : undefined,
            onClick,
          };
        }),
        {
          key: "onboard:equal_opportunities",
          label: "Equal Opportunities",
          status: isLocked
            ? ("locked" as PortalItemStatus)
            : normalizeStatus(stepStatuses.equal_opportunities),
          disabled: isLocked,
          hint: isLocked ? lockedHint : undefined,
          onClick: isLocked
            ? undefined
            : () => {
                selectOnboardingStep("identity");
                if (typeof window !== "undefined") {
                  window.location.hash = "#equal-opportunities";
                }
              },
        },
        ...ADDITIONAL_ONBOARDING_ITEMS.filter(
          // These two declarations are already surfaced via their
          // PORTAL_STEPS counterparts ("Right to Work" → age_and_eligibility,
          // "Health Declaration" → occupational_health) so we skip them
          // here to avoid duplicate sidebar entries.
          (item) =>
            item.key !== "age_and_eligibility" &&
            item.key !== "occupational_health",
        ).map((item) => {
          const declStatus = declarationsSummary?.items.find((d) => d.key === item.key)?.status;
          let mapped: PortalItemStatus = "not_started";
          let hint: string | undefined;
          if (declStatus === "submitted") { mapped = "completed"; hint = "Submitted"; }
          else if (declStatus === "draft") { mapped = "in_progress"; hint = "Draft saved"; }
          else if (declStatus === "reopened") { mapped = "in_progress"; hint = "Re-opened by admin"; }
          return {
            key: `onboard:${item.key}`,
            label: item.name,
            status: isLocked ? ("locked" as PortalItemStatus) : mapped,
            disabled: isLocked || !selectDeclaration,
            hint: isLocked ? lockedHint : hint,
            onClick: isLocked || !selectDeclaration
              ? undefined
              : () => selectDeclaration(item.key),
          };
        }),
      ],
    },
    {
      key: "induction",
      title: "Induction",
      icon: <BookOpenCheck className="h-3.5 w-3.5" />,
      defaultOpen: !isLocked,
      items: [
        // Service Agreement — first Induction item, gated on admin approval.
        ...(serviceAgreementSigned !== undefined ? [serviceAgreementItem] : []),
        {
          key: "induction:handbook",
          label: "Staff Handbook induction",
          status: isLocked || stageLocked
            ? ("locked" as PortalItemStatus)
            : inductionSummary
              ? inductionSummary.unlocked
                ? "completed"
                : "in_progress"
              : "in_progress",
          hint: isLocked
            ? lockedHint
            : stageLocked
              ? stageLockedHint
              : inductionSummary
                ? inductionSummary.unlocked
                  ? `All ${inductionSummary.total} acknowledged`
                  : `${inductionSummary.outstanding} of ${inductionSummary.total} outstanding`
                : undefined,
          disabled: isLocked || stageLocked || !selectInduction,
          onClick: isLocked || stageLocked ? undefined : selectInduction,
        },
        {
          key: "induction:policies",
          label: "Policies to read & sign",
          status: isLocked || stageLocked ? ("locked" as PortalItemStatus) : policiesStatus,
          hint: isLocked ? lockedHint : stageLocked ? stageLockedHint : policiesHint,
          onClick: isLocked || stageLocked ? undefined : selectPolicies,
          disabled: isLocked || stageLocked || !selectPolicies,
        },
        ...(sopComprehensionSummary
          ? [
              {
                key: "induction:sop_comprehension",
                label: "SOP comprehension quizzes",
                status: (isLocked || stageLocked
                  ? "locked"
                  : sopComprehensionSummary.totalRequired === 0
                    ? "completed"
                    : sopComprehensionSummary.outstanding === 0
                      ? "completed"
                      : "in_progress") as PortalItemStatus,
                hint: isLocked
                  ? lockedHint
                  : stageLocked
                    ? stageLockedHint
                    : sopComprehensionSummary.totalRequired === 0
                      ? "Unlock once you've acknowledged each SOP"
                      : sopComprehensionSummary.outstanding === 0
                        ? `All ${sopComprehensionSummary.totalRequired} passed`
                        : `${sopComprehensionSummary.outstanding} of ${sopComprehensionSummary.totalRequired} outstanding`,
                disabled: isLocked || stageLocked || !selectSopComprehension,
                onClick: isLocked || stageLocked ? undefined : selectSopComprehension,
              },
            ]
          : []),
      ],
    },
    {
      key: "training",
      title: "Training",
      icon: <GraduationCap className="h-3.5 w-3.5" />,
      defaultOpen: !isLocked,
      items: (() => {
        // Training/Arcade preserves the original gate: locked behind
        // assessment, behind compliance approval, and (per pre-existing
        // behaviour) behind the induction handbook being unlocked.
        const handbookLocked = !!inductionSummary && !inductionSummary.unlocked;
        const trainingLocked = isLocked || stageLocked || handbookLocked;
        const trainingHint = isLocked
          ? lockedHint
          : stageLocked
            ? stageLockedHint
            : handbookLocked
              ? `Locked — finish all ${inductionSummary!.total} induction items first`
              : undefined;
        return [
          {
            key: "training:training_docs",
            label: "Mandatory Training",
            status: trainingLocked
              ? ("locked" as PortalItemStatus)
              : normalizeStatus(stepStatuses.training),
            disabled: trainingLocked,
            hint: trainingHint,
            onClick: trainingLocked
              ? undefined
              : () => selectOnboardingStep("training"),
          },
          {
            key: "training:internal_training",
            label: "Internal Training",
            status: trainingLocked
              ? ("locked" as PortalItemStatus)
              : ("in_progress" as PortalItemStatus),
            disabled: trainingLocked,
            hint: trainingLocked ? trainingHint : "Upload your training completion certificates",
            onClick: trainingLocked
              ? undefined
              : () => { window.location.href = `/portal/internal-training`; },
          },
          {
            key: "training:arcade",
            label: "Clinical Skills Arcade",
            status: trainingLocked
              ? ("locked" as PortalItemStatus)
              : normalizeStatus(journey.skillsArcade.status),
            disabled: trainingLocked,
            hint: trainingHint,
            onClick: trainingLocked
              ? undefined
              : () => {
                  const url = journey.skillsArcade.actionUrl || `/arcade?token=${token}`;
                  window.location.href = url;
                },
          },
        ];
      })(),
    },
    ...(availabilityEnabled
      ? [
          {
            key: "rostering",
            title: "Rostering",
            icon: <CalendarDays className="h-3.5 w-3.5" />,
            defaultOpen: true,
            items: [
              {
                key: "rostering:availability",
                label: "My Availability",
                status: "in_progress" as PortalItemStatus,
                hint: "AM / PM / Night per day",
                onClick: selectAvailability
                  ? selectAvailability
                  : () => { window.location.href = `/portal/availability`; },
                disabled: !selectAvailability,
              },
            ],
          },
        ]
      : []),
    ...(invoicesEnabled
      ? [
          {
            key: "finance",
            title: "Finance",
            icon: <FileText className="h-3.5 w-3.5" />,
            defaultOpen: true,
            items: [
              {
                key: "finance:invoices",
                label: "Invoices",
                status: "in_progress" as PortalItemStatus,
                hint: "Submit timesheets & track payment",
                onClick: selectInvoices
                  ? selectInvoices
                  : () => { window.location.href = `/portal/invoices`; },
                disabled: !selectInvoices,
              },
            ],
          },
        ]
      : []),
  ];

  return baseGroups;
}

export function PortalShellEmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 text-muted-foreground/40">{icon || <AlertCircle className="h-8 w-8" />}</div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
    </div>
  );
}
