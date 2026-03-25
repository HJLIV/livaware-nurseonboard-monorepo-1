import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  ScrollText,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Target,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Info,
  UserPlus,
  Send,
  FileText,
  Shield,
  BarChart3,
  Clock,
  Zap,
  Eye,
  Settings,
  Search,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface SOPStep {
  action: string;
  detail?: string;
  tip?: string;
}

interface SOPSection {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  overview: string;
  steps: SOPStep[];
  quickLink?: string;
  quickLinkLabel?: string;
  warnings?: string[];
  tips?: string[];
}

const SOP_SECTIONS: SOPSection[] = [
  {
    id: "dashboard",
    title: "Dashboard Overview",
    icon: LayoutDashboard,
    color: "text-blue-400",
    overview:
      "The dashboard is your command centre. It shows real-time statistics about your nurse workforce pipeline, from initial registration through preboard, onboard, and skills competency.",
    steps: [
      {
        action: "View pipeline statistics",
        detail:
          "The top row of cards shows total nurses, preboard completions, onboard clearances, and skills competency counts. Click any card to navigate to the relevant section.",
      },
      {
        action: "Check the pipeline funnel",
        detail:
          "The funnel chart visualises how many nurses are at each stage: Preboard, Onboard, Skills Arcade, and Completed. This helps identify bottlenecks.",
      },
      {
        action: "Review recent activity",
        detail:
          "The activity feed shows the latest actions across the platform — nurse registrations, portal link generations, stage advances, and document uploads.",
      },
      {
        action: "Register a new nurse directly",
        detail:
          'Click the "Register New Nurse" button to open the quick-registration form without leaving the dashboard.',
      },
    ],
    quickLink: "/",
    quickLinkLabel: "Go to Dashboard",
    tips: [
      "The dashboard refreshes automatically — you always see the latest data.",
      "Use the dashboard as your morning check-in to review overnight activity.",
    ],
  },
  {
    id: "registration",
    title: "Registering a New Nurse",
    icon: UserPlus,
    color: "text-emerald-400",
    overview:
      'This is the first step in the nurse onboarding journey. When you register a nurse, the system automatically creates their profile and generates a preboard portal link.',
    steps: [
      {
        action: 'Navigate to the Nurses page or click "Register New Nurse" on the Dashboard',
        detail: 'The Onboard section in the sidebar takes you to the Nurses page.',
      },
      {
        action: 'Click "Register & Invite Nurse"',
        detail: "This opens the registration dialog.",
      },
      {
        action: "Fill in the nurse details",
        detail:
          "Enter the nurse's full name, email address, and optionally their phone number. The email must be unique.",
        tip: "Double-check the email address — this is how the nurse receives their portal link.",
      },
      {
        action: 'Click "Register Nurse"',
        detail:
          "The system creates the nurse profile, sets their stage to Preboard, and automatically generates a portal invitation link.",
      },
      {
        action: "Copy and send the portal link",
        detail:
          "After registration, you'll see a success dialog with the portal link. Copy this link and send it to the nurse via email or your preferred communication channel.",
        tip: "Portal links expire after 30 days. You can regenerate them from the nurse detail page.",
      },
    ],
    quickLink: "/nurses",
    quickLinkLabel: "Go to Nurses",
    warnings: [
      "Always verify the nurse's email address before sending the portal link.",
      "Each nurse must have a unique email address in the system.",
    ],
  },
  {
    id: "nurse-management",
    title: "Managing Nurses & Candidates",
    icon: Users,
    color: "text-violet-400",
    overview:
      "The Nurses page and Candidates page give you complete oversight of every nurse in the system. You can search, filter, view details, and manage each nurse's journey.",
    steps: [
      {
        action: "Search and filter nurses",
        detail:
          "Use the search bar at the top to find nurses by name or email. Results filter in real time as you type.",
      },
      {
        action: "Click on a nurse to view their profile",
        detail:
          "The detail page shows five tabs: Overview, Preboard, Onboard, Skills Arcade, and Audit Trail. Each tab gives you deep visibility into that stage.",
      },
      {
        action: "Review the Overview tab",
        detail:
          "Shows the nurse's current stage, contact details, and a journey stepper visualising their progress through all stages.",
      },
      {
        action: "Check the Preboard tab",
        detail:
          "View whether the nurse has completed their preboard assessment, their score, and any flagged domains.",
      },
      {
        action: "Check the Onboard tab",
        detail:
          "See which onboarding documents have been submitted, verified, or are still pending. This includes identity, NMC, DBS, references, and training records.",
      },
      {
        action: "Review the Audit Trail tab",
        detail:
          "Every action taken on this nurse — registrations, portal visits, document uploads, stage changes — is logged here with timestamps.",
      },
    ],
    quickLink: "/nurses",
    quickLinkLabel: "Go to Nurses",
    tips: [
      "Use the Candidates view (/candidates) for the full onboarding detail with AI compliance tools.",
      'The Pipeline view gives you a Kanban-style board of all nurses grouped by stage.',
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline Management",
    icon: GitBranch,
    color: "text-amber-400",
    overview:
      "The Pipeline page provides a Kanban-style board view of your entire nurse workforce, organised by onboarding stage. Drag-and-drop style visibility into where every nurse sits in the process.",
    steps: [
      {
        action: "Navigate to Pipeline from the sidebar",
        detail:
          "The pipeline shows columns for each stage: Application, Verification, Competency, References, Induction, and Cleared.",
      },
      {
        action: "Review each column",
        detail:
          "Each card shows the nurse's name and how long they've been in that stage. Use this to identify nurses who may be stuck or need follow-up.",
      },
      {
        action: "Click a nurse card to view their detail",
        detail: "Opens the full nurse profile where you can take action on their onboarding.",
      },
    ],
    quickLink: "/pipeline",
    quickLinkLabel: "Go to Pipeline",
    tips: [
      "Check the pipeline daily to identify nurses who've been in a stage for too long.",
      "The time indicator on each card helps you enforce SLA targets for onboarding completion.",
    ],
  },
  {
    id: "preboard",
    title: "Preboard Assessment (Admin View)",
    icon: ClipboardCheck,
    color: "text-rose-400",
    overview:
      "Preboard is a clinical screening gate — a timed assessment that evaluates how nurses think through real-world clinical scenarios. As an admin, you review submitted assessments and decide whether to advance nurses to the onboarding stage.",
    steps: [
      {
        action: "Navigate to Preboard in the sidebar",
        detail:
          "The admin preboard page shows all submitted assessments with scores and timestamps.",
      },
      {
        action: "Review an assessment",
        detail:
          "Click on an assessment to see the nurse's responses, domain scores (clinical reasoning, medication safety, communication, etc.), and overall result.",
      },
      {
        action: "Advance or hold a nurse",
        detail:
          'If the assessment meets your standards, advance the nurse to the Onboard stage from their profile page. If not, you can leave them at the Preboard stage for re-assessment.',
        tip: "The preboard is designed to be completed in 10-15 minutes. Nurses access it through their portal link.",
      },
    ],
    quickLink: "/preboard",
    quickLinkLabel: "Go to Preboard",
    warnings: [
      "Nurses can only access the preboard assessment through their unique portal link.",
      "Assessment responses are time-limited — the timer is visible to the nurse during the assessment.",
    ],
  },
  {
    id: "portal",
    title: "Nurse Portal & Onboarding",
    icon: ShieldCheck,
    color: "text-cyan-400",
    overview:
      "The nurse-facing portal is where nurses complete their entire onboarding journey. They access it through a unique token link. The portal guides them through preboard assessment, document uploads, and compliance checks.",
    steps: [
      {
        action: "Understanding the nurse's portal experience",
        detail:
          'When a nurse clicks their portal link, they see a journey hub with three stages: Preboard Assessment, Onboarding, and Skills Arcade. They must complete each stage in order.',
      },
      {
        action: "First visit vs return visit",
        detail:
          "On their first visit, nurses see a welcome introduction explaining what to expect. On return visits, they go directly to their journey hub.",
      },
      {
        action: "Monitoring portal activity",
        detail:
          'All portal visits, document uploads, and form submissions are logged in the audit trail. Check individual nurse audit tabs or the main Audit Trail page.',
      },
      {
        action: "Regenerating portal links",
        detail:
          'If a nurse\'s link has expired or they\'ve lost it, go to their profile page and click "Send Portal Link" to generate a new one.',
      },
      {
        action: "Onboarding data entry",
        detail:
          "Nurses fill in 10 sections on the onboarding page: Identity & Contact, NMC PIN, DBS, Health & Disability, Competencies, Employment History, References, Training & Certs, Uniform & Equipment, and Policies & Agreements.",
      },
    ],
    tips: [
      "Nurses can save progress and return later — the portal remembers where they left off.",
      "Document uploads support PDF, JPG, PNG, and DOC formats up to 10MB.",
      "All uploaded documents are linked to the nurse's record and visible in the admin view.",
    ],
  },
  {
    id: "arcade",
    title: "Skills Arcade Administration",
    icon: Gamepad2,
    color: "text-orange-400",
    overview:
      "The Clinical Skills Arcade contains 40 competency modules covering essential clinical scenarios. As an admin, you can manage modules, view reports, and manage user assignments.",
    steps: [
      {
        action: "Access the Arcade dashboard",
        detail:
          'Navigate to Skills Arcade in the sidebar. As an admin, you\'ll see the "Clinical Module Library" showing all 40 modules with search functionality.',
      },
      {
        action: "Search and browse modules",
        detail:
          'Use the search bar to find specific modules (e.g., "insulin", "wound", "medication"). Each module card shows the module name, description, and a walkthrough button.',
      },
      {
        action: "Manage Modules",
        detail:
          'Click "Manage Modules" or navigate to the Modules page under Arcade in the sidebar. Here you can view all modules, toggle active/inactive status, and see scenario counts.',
        tip: "Deactivating a module hides it from nurses but preserves all historical data.",
      },
      {
        action: "View Reports",
        detail:
          'Click "Reports" to see platform-wide statistics: total attempts, pass rates, average attempts to pass, and per-module breakdowns. You can export data as CSV.',
      },
      {
        action: "Manage Users",
        detail:
          "The Users page shows all nurses assigned to the arcade, their completion status, and scores.",
      },
    ],
    quickLink: "/arcade",
    quickLinkLabel: "Go to Skills Arcade",
    tips: [
      "The arcade has 40 modules spanning medication, wound care, infection control, mental health, palliative care, and more.",
      "Nurses access scenarios through their portal journey or direct assignment.",
      "Each scenario includes clinical walkthroughs that nurses can review before attempting the assessment.",
    ],
  },
  {
    id: "audit",
    title: "Audit Trail & Compliance",
    icon: ScrollText,
    color: "text-teal-400",
    overview:
      "The Audit Trail provides a complete, tamper-evident log of every action taken on the platform. This is essential for CQC compliance, internal governance, and resolving disputes.",
    steps: [
      {
        action: "Navigate to Audit Trail in the sidebar",
        detail:
          "The main audit page shows all log entries across the platform, ordered by most recent first.",
      },
      {
        action: "Filter by module",
        detail:
          'Use the Module filter dropdown to view only entries from a specific area: Admin, Portal, System, Preboard, or Arcade.',
      },
      {
        action: "Search for specific actions",
        detail:
          'Use the search box to find specific events. Common searches: "nurse_created", "portal_accessed", "document_uploaded", "stage_advanced".',
      },
      {
        action: "View nurse-specific audit trails",
        detail:
          "Each nurse's detail page has an Audit Trail tab showing only events related to that specific nurse.",
      },
    ],
    quickLink: "/audit",
    quickLinkLabel: "Go to Audit Trail",
    tips: [
      "Every audit entry includes: timestamp, action type, module, agent (who performed it), and detail payload.",
      "Audit logs are append-only — they cannot be edited or deleted.",
      "Use the audit trail for CQC inspections to demonstrate your onboarding governance.",
    ],
    warnings: [
      "Do not share audit trail screenshots externally without redacting personal nurse data.",
    ],
  },
];

const QUICK_REFERENCE = [
  {
    title: "Daily Checks",
    icon: Clock,
    items: [
      "Review dashboard for overnight activity and new registrations",
      "Check pipeline for nurses stuck at any stage",
      "Review any new preboard assessment submissions",
      "Follow up on pending document uploads",
    ],
  },
  {
    title: "Weekly Tasks",
    icon: Target,
    items: [
      "Review Skills Arcade reports for completion trends",
      "Check audit trail for any unusual activity",
      "Follow up with nurses who have stalled onboarding",
      "Export reports for management review",
    ],
  },
  {
    title: "New Nurse Workflow",
    icon: Zap,
    items: [
      "Register nurse with full name and email",
      "Copy portal link and send to nurse",
      "Monitor preboard assessment completion",
      "Review preboard results and advance to onboard",
      "Monitor document uploads and compliance checks",
      "Assign Skills Arcade modules when onboarding complete",
    ],
  },
];

function SOPCard({ section, isExpanded, onToggle }: {
  section: SOPSection;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = section.icon;

  return (
    <Card className="overflow-hidden transition-all duration-200">
      <button
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60", section.color)}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">{section.title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{section.overview}</p>
              </div>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
          </div>
        </CardHeader>
      </button>

      {isExpanded && (
        <CardContent className="pt-0 pb-5">
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{section.overview}</p>

          <div className="space-y-4 mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Procedure</p>
            {section.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{step.action}</p>
                  {step.detail && (
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{step.detail}</p>
                  )}
                  {step.tip && (
                    <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-300/80">{step.tip}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {section.tips && section.tips.length > 0 && (
            <div className="mb-4">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Tips
                </p>
                <ul className="space-y-1.5">
                  {section.tips.map((tip, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-emerald-500/60 mt-1">-</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {section.warnings && section.warnings.length > 0 && (
            <div className="mb-4">
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Important
                </p>
                <ul className="space-y-1.5">
                  {section.warnings.map((warning, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-amber-500/60 mt-1">-</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {section.quickLink && (
            <Link href={section.quickLink}>
              <Button variant="outline" size="sm" className="gap-2">
                {section.quickLinkLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function AdminGuidePage() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["dashboard"]));
  const [searchQuery, setSearchQuery] = useState("");

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(SOP_SECTIONS.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const filteredSections = SOP_SECTIONS.filter((section) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      section.title.toLowerCase().includes(q) ||
      section.overview.toLowerCase().includes(q) ||
      section.steps.some(
        (step) =>
          step.action.toLowerCase().includes(q) ||
          step.detail?.toLowerCase().includes(q)
      )
    );
  });

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">
            Administrator Guide
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight mb-2">
            Walkthroughs & SOPs
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            Step-by-step procedures for managing the Livaware NurseOnboard platform.
            Follow these standard operating procedures to ensure consistent, compliant nurse onboarding.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {QUICK_REFERENCE.map((ref) => {
            const Icon = ref.icon;
            return (
              <Card key={ref.title} className="bg-muted/20">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">{ref.title}</p>
                  </div>
                  <ol className="space-y-2">
                    {ref.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-bold mt-0.5">
                          {i + 1}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Separator className="mb-6" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Standard Operating Procedures</h2>
            <Badge variant="secondary" className="text-[10px]">
              {SOP_SECTIONS.length} sections
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs">
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs">
              Collapse all
            </Button>
          </div>
        </div>

        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search procedures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
        </div>

        <div className="space-y-3 mb-10">
          {filteredSections.map((section) => (
            <SOPCard
              key={section.id}
              section={section}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
          {filteredSections.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No procedures match your search.</p>
            </div>
          )}
        </div>

        <Card className="bg-muted/10 border-dashed">
          <CardContent className="py-6">
            <div className="text-center">
              <Shield className="h-8 w-8 text-primary/40 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Need help?</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                If you encounter issues not covered in these SOPs, contact your platform administrator
                or the Livaware support team. All platform actions are logged in the audit trail for troubleshooting.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
