import { useState, useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Check,
  Clock,
  ChevronDown,
  ChevronRight,
  Lock,
  Menu,
  Circle,
  ListChecks,
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  BookOpenCheck,
  LayoutDashboard,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { STEP_STATUS, PORTAL_STEPS, ASSESSMENT_HOISTED_STEP_KEYS } from "@shared/schema";

export type PortalItemStatus =
  | "completed"
  | "awaiting_verification"
  | "in_progress"
  | "pending"
  | "locked"
  | "coming_soon";

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

function StatusLabel({ status }: { status: PortalItemStatus }) {
  switch (status) {
    case "completed":
      return <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-500">Done</span>;
    case "awaiting_verification":
      return <span className="text-[10px] font-medium uppercase tracking-wider text-amber-500">Pending</span>;
    case "in_progress":
      return <span className="text-[10px] font-medium uppercase tracking-wider text-primary/80">In progress</span>;
    case "locked":
      return <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Locked</span>;
    case "coming_soon":
      return <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Coming soon</span>;
    default:
      return <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Not started</span>;
  }
}

function getOutstandingSummary(groups: PortalSidebarGroup[]) {
  // List up to 5 outstanding items across all groups, prioritising
  // in_progress > pending > awaiting_verification, skipping completed,
  // locked, and coming_soon (placeholder) items.
  const all: { group: string; item: PortalSidebarItem }[] = [];
  for (const g of groups) {
    if (g.key === "overview") continue;
    for (const item of g.items) {
      if (
        item.status === "completed" ||
        item.status === "locked" ||
        item.status === "coming_soon"
      ) continue;
      all.push({ group: g.title, item });
    }
  }
  all.sort((a, b) =>
    STAGE_ORDER.indexOf(a.item.status) - STAGE_ORDER.indexOf(b.item.status),
  );
  return all;
}

function ItemButton({
  item,
  active,
  onSelect,
}: {
  item: PortalSidebarItem;
  active: boolean;
  onSelect?: (item: PortalSidebarItem) => void;
}) {
  const content = (
    <>
      <StatusDot status={item.status} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.status === "awaiting_verification" && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-500/80 shrink-0">
          pending
        </span>
      )}
      {active && <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />}
    </>
  );

  const className = cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm w-full transition-colors",
    active
      ? "bg-primary/10 text-foreground font-medium"
      : item.disabled
        ? "text-muted-foreground/50 cursor-not-allowed"
        : "text-foreground/80 hover:bg-secondary hover:text-foreground",
  );

  if (item.disabled) {
    return (
      <div className={className} aria-disabled data-testid={`portal-shell-item-${item.key}`}>
        {content}
      </div>
    );
  }

  if (item.href && !item.onClick) {
    return (
      <Link
        href={item.href}
        className={className}
        data-testid={`portal-shell-item-${item.key}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        item.onClick?.();
        onSelect?.(item);
      }}
      data-testid={`portal-shell-item-${item.key}`}
    >
      {content}
    </button>
  );
}

function GroupSection({
  group,
  activeKey,
  onSelect,
}: {
  group: PortalSidebarGroup;
  activeKey: string;
  onSelect?: (item: PortalSidebarItem) => void;
}) {
  const containsActive = group.items.some((i) => i.key === activeKey);
  const [open, setOpen] = useState<boolean>(group.defaultOpen ?? containsActive ?? true);

  const completedCount = group.items.filter((i) => i.status === "completed").length;
  const totalCount = group.items.filter((i) => i.status !== "coming_soon").length;
  const showProgress = totalCount > 0 && group.key !== "overview";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-1 py-1.5 text-left group"
          data-testid={`portal-shell-group-${group.key}`}
        >
          {group.icon && <span className="text-muted-foreground/70 shrink-0">{group.icon}</span>}
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 group-hover:text-foreground transition-colors">
            {group.title}
          </span>
          {showProgress && (
            <span className="ml-auto text-[10px] font-medium text-muted-foreground/50">
              {completedCount}/{totalCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/60 transition-transform shrink-0",
              !open && "-rotate-90",
              !showProgress && "ml-auto",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 motion-reduce:animate-none motion-reduce:transition-none">
        <div className="space-y-0.5 pl-1 pt-1 pb-2">
          {group.items.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground/60 italic">
              {group.emptyMessage || "Nothing here yet"}
            </p>
          ) : (
            group.items.map((item) => (
              <ItemButton
                key={item.key}
                item={item}
                active={item.key === activeKey}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToDoSummary({
  groups,
  onSelect,
  counts,
}: {
  groups: PortalSidebarGroup[];
  onSelect?: (item: PortalSidebarItem) => void;
  counts?: PortalToDoCounts;
}) {
  const outstanding = useMemo(() => getOutstandingSummary(groups), [groups]);
  const total = outstanding.length;
  const top = outstanding.slice(0, 4);

  const countRows = useMemo(() => {
    if (!counts) return [] as { key: string; label: string; value: number; details?: string[] }[];
    const rows: { key: string; label: string; value: number; details?: string[] }[] = [];
    if (counts.documents > 0) {
      rows.push({
        key: "documents",
        label: counts.documents === 1 ? "document missing" : "documents missing",
        value: counts.documents,
        details: counts.missingDocumentLabels,
      });
    }
    if (counts.training > 0) {
      rows.push({
        key: "training",
        label: counts.training === 1
          ? "training certificate outstanding"
          : "training certificates outstanding",
        value: counts.training,
      });
    }
    if (counts.references > 0) {
      rows.push({
        key: "references",
        label: counts.references === 1 ? "reference needed" : "references needed",
        value: counts.references,
      });
    }
    return rows;
  }, [counts]);

  return (
    <div
      className="rounded-lg border border-primary/15 bg-primary/5 p-3 mb-4"
      data-testid="portal-shell-todo-summary"
    >
      <div className="flex items-center gap-2 mb-2">
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          To do
        </span>
        <span className="ml-auto text-[10px] font-medium text-muted-foreground" data-testid="portal-shell-todo-count">
          {total === 0 ? "All caught up" : `${total} outstanding`}
        </span>
      </div>
      {countRows.length > 0 && (
        <div className="space-y-1 mb-2" data-testid="portal-shell-todo-counts">
          {countRows.map((row) => (
            <div
              key={row.key}
              className="text-xs text-foreground/85"
              data-testid={`portal-shell-todo-count-${row.key}`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-base font-light text-primary tabular-nums">
                  {row.value}
                </span>
                <span className="text-muted-foreground">{row.label}</span>
              </div>
              {row.details && row.details.length > 0 && (
                <p
                  className="mt-0.5 pl-[1.4rem] text-[11px] leading-snug text-muted-foreground/80"
                  data-testid={`portal-shell-todo-count-${row.key}-details`}
                >
                  {row.details.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {total === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          You've completed every required step. Thank you!
        </p>
      ) : (
        <div className="space-y-1">
          {top.map(({ item, group }) => (
            <button
              key={`todo-${item.key}`}
              type="button"
              onClick={() => {
                item.onClick?.();
                onSelect?.(item);
              }}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-primary/10 transition-colors"
              data-testid={`portal-shell-todo-${item.key}`}
            >
              <StatusDot status={item.status} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                <p className="text-[10px] text-muted-foreground/70 truncate">{group}</p>
              </div>
            </button>
          ))}
          {total > top.length && (
            <p className="text-[10px] text-muted-foreground/60 px-1.5 pt-1">
              + {total - top.length} more below
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  groups,
  activeKey,
  onItemSelect,
  todoCounts,
}: {
  groups: PortalSidebarGroup[];
  activeKey: string;
  onItemSelect?: (item: PortalSidebarItem) => void;
  todoCounts?: PortalToDoCounts;
}) {
  return (
    <div className="space-y-1">
      <ToDoSummary groups={groups} onSelect={onItemSelect} counts={todoCounts} />
      {groups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          activeKey={activeKey}
          onSelect={onItemSelect}
        />
      ))}
    </div>
  );
}

export function PortalShell({
  candidateName,
  groups,
  activeKey,
  onItemSelect,
  todoCounts,
  children,
}: PortalShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (item: PortalSidebarItem) => {
    onItemSelect?.(item);
    setMobileOpen(false);
  };

  const activeItem = useMemo(() => {
    for (const g of groups) {
      const found = g.items.find((i) => i.key === activeKey);
      if (found) return { group: g.title, item: found };
    }
    return null;
  }, [groups, activeKey]);

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="portal-shell">
      <header className="sticky top-0 z-40 border-b border-border bg-sidebar/95 backdrop-blur" data-testid="portal-shell-header">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            className="lg:hidden -ml-1 p-2 rounded-md hover:bg-secondary text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            data-testid="portal-shell-mobile-toggle"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/images/livaware-logo-white.png" alt="Livaware" className="h-6 w-auto" />
          <div className="h-5 w-px bg-border mx-1" />
          <p className="text-xs font-medium tracking-[0.14em] uppercase text-primary">
            NurseOnboard
          </p>
          <div className="ml-auto hidden sm:block min-w-0">
            <p className="text-xs text-muted-foreground/70 truncate" data-testid="portal-shell-candidate-name">
              {candidateName}
            </p>
          </div>
        </div>
      </header>

      {/* Mobile breadcrumb of current step (visible on small screens) */}
      {activeItem && (
        <div className="lg:hidden border-b border-border bg-card/60 px-4 py-2" data-testid="portal-shell-mobile-breadcrumb">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
            {activeItem.group}
          </p>
          <p className="text-sm font-medium truncate">{activeItem.item.label}</p>
        </div>
      )}

      <div className="flex-1 w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex gap-6">
          <aside
            className="hidden lg:block w-72 shrink-0"
            aria-label="Portal navigation"
            data-testid="portal-shell-sidebar"
          >
            <div className="sticky top-[5rem] max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
              <SidebarContent
                groups={groups}
                activeKey={activeKey}
                onItemSelect={handleSelect}
                todoCounts={todoCounts}
              />
            </div>
          </aside>

          <main id="main-content" className="flex-1 min-w-0" data-testid="portal-shell-main">
            {children}
          </main>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[20rem] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between space-y-0">
            <SheetTitle className="text-sm font-semibold">Your portal</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarContent
              groups={groups}
              activeKey={activeKey}
              onItemSelect={handleSelect}
              todoCounts={todoCounts}
            />
          </div>
        </SheetContent>
      </Sheet>

      <footer className="border-t border-border bg-card py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-xs text-muted-foreground text-center">
            Livaware Ltd — Secure Nurse Onboarding Portal
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Helpers for building groups ────────────────────────────────────────

interface JourneyData {
  preboard: { status: string; actionUrl?: string; label: string };
  onboard: { status: string; actionUrl?: string; label: string };
  skillsArcade: { status: string; actionUrl?: string; label: string };
}

export interface PortalGateInfo {
  unlocked: boolean;
  mode: "auto" | "manual";
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
  // Assessment-group selectors. When omitted the items fall back to
  // sensible default URLs (preboard assessment / portal page).
  selectCompetency?: () => void;
  selectCvUpload?: () => void;
  // Onboarding access gate state — when present and `unlocked === false`
  // the Onboarding/Compliance/Skills Arcade groups are rendered as
  // disabled with a "Locked — finish Assessment first" hint.
  gate?: PortalGateInfo | null;
}

// Additional onboarding declarations the candidate must complete alongside
// the existing PORTAL_STEPS. These are surfaced in the sidebar now and the
// actual forms will be added in follow-up work.
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
  selectCompetency,
  selectCvUpload,
  gate,
}: BuildGroupsArgs): PortalSidebarGroup[] {
  const isLocked = !!gate && gate.unlocked === false;
  const lockedHint = "Locked — finish Assessment first";

  // Assessment-group item statuses derive from the gate prerequisites
  // when we have them, otherwise from the existing journey/stepStatus
  // signals so the sidebar still works on legacy portal pages.
  const examStatus: PortalItemStatus = gate?.prerequisites.examinationCompleted
    ? "completed"
    : normalizeStatus(journey.preboard.status);
  const competencyStatus: PortalItemStatus = gate?.prerequisites.competencyDeclared
    ? "completed"
    : normalizeStatus(stepStatuses.competency);
  const cvStatus: PortalItemStatus = gate?.prerequisites.cvReviewed
    ? "completed"
    : "in_progress";

  // Compute the Policies item status from the live summary. If we don't yet
  // have the data (initial load), fall back to a neutral "in_progress" so
  // the item is at least clickable.
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
  return [
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
          onClick: () => {
            const url = journey.preboard.actionUrl || `/preboard/assessment?token=${token}`;
            window.location.href = url;
          },
        },
        {
          key: "assessment:competency",
          label: "Clinical competency",
          status: competencyStatus,
          onClick: selectCompetency
            ? selectCompetency
            : () => {
                window.location.href = `/portal/page/${token}?step=competency`;
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
              : undefined,
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
      title: "Onboarding",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      defaultOpen: !isLocked,
      items: [
        ...PORTAL_STEPS.filter(
          (step) => !ASSESSMENT_HOISTED_STEP_KEYS.includes(step.key),
        ).map((step) => ({
          key: `onboard:${step.key}`,
          label: step.name,
          status: isLocked ? ("locked" as PortalItemStatus) : normalizeStatus(stepStatuses[step.key]),
          disabled: isLocked,
          hint: isLocked ? lockedHint : undefined,
          onClick: isLocked ? undefined : () => selectOnboardingStep(step.key),
        })),
        ...ADDITIONAL_ONBOARDING_ITEMS.map((item) => ({
          key: `onboard:${item.key}`,
          label: item.name,
          status: "coming_soon" as PortalItemStatus,
          disabled: true,
          hint: "Coming soon",
        })),
      ],
    },
    {
      key: "compliance",
      title: "Compliance",
      icon: <BookOpenCheck className="h-3.5 w-3.5" />,
      defaultOpen: !isLocked,
      items: [
        {
          key: "compliance:policies",
          label: "Policies to read & sign",
          status: isLocked ? ("locked" as PortalItemStatus) : policiesStatus,
          hint: isLocked ? lockedHint : policiesHint,
          onClick: isLocked ? undefined : selectPolicies,
          disabled: isLocked || !selectPolicies,
        },
        {
          key: "compliance:training_docs",
          label: "Training documents required",
          status: "coming_soon",
          disabled: true,
          hint: "Coming soon",
        },
        {
          key: "compliance:livaware_modules",
          label: "Livaware training modules",
          status: "coming_soon",
          disabled: true,
          hint: "Coming soon",
        },
        {
          key: "compliance:arcade",
          label: "Clinical Skills Arcade",
          status: isLocked ? ("locked" as PortalItemStatus) : normalizeStatus(journey.skillsArcade.status),
          disabled: isLocked,
          hint: isLocked ? lockedHint : undefined,
          onClick: isLocked
            ? undefined
            : () => {
                const url = journey.skillsArcade.actionUrl || `/arcade?token=${token}`;
                window.location.href = url;
              },
        },
      ],
    },
  ];
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
