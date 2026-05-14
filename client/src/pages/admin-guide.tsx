import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { SuperAdminViewOnlyBanner } from "@/components/super-admin-only";
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
    id: "induction-policies",
    title: "Induction & Policies (21 sections)",
    icon: LayoutDashboard,
    color: "text-amber-400",
    overview:
      "The Staff Handbook is split into 21 separate read-and-acknowledge items (6 Handbook Parts + 14 SOPs + 1 Appendices bundle) sourced from the bundled Staff-Handbook markdown. Candidates must acknowledge ALL 21 before the Skills Arcade unlocks. Reading time is silently tracked per section for admin review — nothing is shown to the candidate.",
    steps: [
      {
        action: "How candidates progress",
        detail:
          "On the portal, each section opens to its own card with the full body text. The 'I have read & understood' button stays disabled until the candidate visibly scrolls to the end. Their scroll position is saved per section so they can resume later. Acknowledgements are versioned — bumping a section's version forces re-acknowledgement.",
      },
      {
        action: "Review a single nurse's reading record",
        detail:
          "Open the nurse detail page → Induction Progress panel. Super-admins see Active time, Longest single session, Session count, Scrolled-to-end, and Last-read timestamp per section, all sourced from silent client-side activity tracking.",
      },
      {
        action: "Cross-roster engagement view",
        detail:
          "Super-admins: Activity Dashboard now ends with an Induction & policies engagement table — one row per nurse with completion %, total active time, last-read, and a 'Short acks' badge flagging acknowledgements logged with under 30s of active time (potentially rushed).",
      },
      {
        action: "Edit handbook content",
        detail:
          "Use Admin → Policies. Edits to induction items are preserved across restarts — the boot seeder is insert-only. Bump the section's version field to force every nurse to re-acknowledge after a content change.",
      },
      {
        action: "Force-reseed back to the bundled handbook",
        detail:
          "Super-admin only: POST /api/admin/induction/reseed overwrites all 21 sections back to the bundled markdown. Use this to discard drifted edits or after pulling a new handbook revision.",
      },
      {
        action: "Legacy 'Induction & Policies' completers",
        detail:
          "Nurses who completed the legacy single induction policy were automatically credited with all 21 new sections on first deploy — they will not be retroactively gated.",
      },
      {
        action: "How this links to Skills Arcade",
        detail:
          "Each arcade module now carries a sopRefs list pointing to the handbook SOP slugs it teaches (e.g. medication modules → induction:sop-12-medicines, IV modules → induction:sop-03-peripheral-iv / induction:sop-04-picc). The boot reconciler only patches modules whose sopRefs is empty, so trainer/admin curation is preserved.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard Overview",
    icon: LayoutDashboard,
    color: "text-blue-400",
    overview:
      "The dashboard is your command centre. It shows real-time statistics about your workforce pipeline, from initial registration through applicant assessment, candidate onboarding, and skills competency.",
    steps: [
      {
        action: "View pipeline statistics",
        detail:
          "The top row of cards shows totals for applicants, candidates, and nurses at each stage. Click any card to navigate to the relevant section.",
      },
      {
        action: "Check the pipeline funnel",
        detail:
          "The funnel chart visualises how many people are at each stage: Applicant, Candidate, Onboarding, Skills Arcade, and Nurse. This helps identify bottlenecks.",
      },
      {
        action: "Review recent activity",
        detail:
          "The activity feed shows the latest actions across the platform — nurse registrations, portal link generations, stage advances, and document uploads.",
      },
      {
        action: "Register a new applicant directly",
        detail:
          'Click the "Register" button to open the quick-registration form without leaving the dashboard.',
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
      'This is the first step in the onboarding journey. When you register an applicant, the system automatically creates their profile and generates an assessment portal link.',
    steps: [
      {
        action: 'Navigate to the Onboarding page or click "Register New Applicant" on the Dashboard',
        detail: 'The Candidates section in the sidebar takes you to the Onboarding page.',
      },
      {
        action: 'Click "Register Applicant"',
        detail: "This opens the registration dialog.",
      },
      {
        action: "Fill in the applicant details",
        detail:
          "Enter the applicant's full name, email address, and optionally their phone number. The email must be unique.",
        tip: "Double-check the email address — this is how the applicant receives their portal link.",
      },
      {
        action: 'Click "Register & Invite"',
        detail:
          "The system creates the applicant profile, sets their stage to Applicant, and automatically generates a portal invitation link.",
      },
      {
        action: "Copy and send the portal link",
        detail:
          "After registration, you'll see a success dialog with the portal link. Copy this link and send it to the nurse via email or your preferred communication channel.",
        tip: "Portal links expire after 30 days. You can regenerate them from the profile detail page.",
      },
    ],
    quickLink: "/nurses",
    quickLinkLabel: "Go to Onboarding",
    warnings: [
      "Always verify the applicant's email address before sending the portal link.",
      "Each applicant must have a unique email address in the system.",
    ],
  },
  {
    id: "nurse-management",
    title: "Managing Applicants & Candidates",
    icon: Users,
    color: "text-violet-400",
    overview:
      "The Onboarding page and Candidates page give you complete oversight of everyone in the system. You can search, filter, view details, and manage each person's journey.",
    steps: [
      {
        action: "Search and filter",
        detail:
          "Use the search bar at the top to find people by name or email. Results filter in real time as you type.",
      },
      {
        action: "Click on a person to view their profile",
        detail:
          "The detail page shows five tabs: Overview, Applicant, Candidate, Skills Arcade, and Audit Trail. Each tab gives you deep visibility into that stage.",
      },
      {
        action: "Review the Overview tab",
        detail:
          "Shows the current stage, contact details, and a journey stepper visualising progress through all stages.",
      },
      {
        action: "Check the Applicant tab",
        detail:
          "View whether the applicant has completed their assessment, their score, and any flagged domains.",
      },
      {
        action: "Check the Candidate tab",
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
      'The Pipeline view gives you a Kanban-style board of everyone grouped by stage.',
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline Management",
    icon: GitBranch,
    color: "text-amber-400",
    overview:
      "The Pipeline page provides a Kanban-style board view of your entire workforce, organised by onboarding stage. Drag-and-drop style visibility into where every person sits in the process.",
    steps: [
      {
        action: "Navigate to Pipeline from the sidebar",
        detail:
          "The pipeline shows columns for each stage: Application, Verification, Competency, References, Induction, and Cleared.",
      },
      {
        action: "Review each column",
        detail:
          "Each card shows the person's name and how long they've been in that stage. Use this to identify anyone who may be stuck or need follow-up.",
      },
      {
        action: "Click a card to view their detail",
        detail: "Opens the full profile where you can take action on their onboarding.",
      },
    ],
    quickLink: "/pipeline",
    quickLinkLabel: "Go to Pipeline",
    tips: [
      "Check the pipeline daily to identify people who've been in a stage for too long.",
      "The time indicator on each card helps you enforce SLA targets for onboarding completion.",
    ],
  },
  {
    id: "preboard",
    title: "Applicant Assessment (Admin View)",
    icon: ClipboardCheck,
    color: "text-rose-400",
    overview:
      "The applicant assessment is a clinical screening gate — a timed assessment that evaluates how applicants think through real-world clinical scenarios. As an admin, you review submitted assessments and decide whether to advance applicants to the candidate onboarding stage.",
    steps: [
      {
        action: "Navigate to Applicants in the sidebar",
        detail:
          "The assessment admin page shows all submitted assessments with scores and timestamps.",
      },
      {
        action: "Review an assessment",
        detail:
          "Click on an assessment to see the applicant's responses, domain scores (clinical reasoning, medication safety, communication, etc.), and overall result.",
      },
      {
        action: "Advance or hold an applicant",
        detail:
          'If the assessment meets your standards, advance the applicant to the Candidate stage from their profile page. If not, you can leave them at the Applicant stage for re-assessment.',
        tip: "The assessment is designed to be completed in 10-15 minutes. Applicants access it through their portal link.",
      },
      {
        action: "Check report delivery & retry if needed",
        detail:
          'Each assessment now shows a "Report Delivery" panel with two pills: AI analysis status and report-email status. The pipeline retries transient failures (Anthropic 5xx/overloaded, network blips) with exponential backoff. If something stays red, click "Re-run AI" or "Resend report email" — both buttons are on the applicant detail page (Assessment tab) and on the Applicants admin detail dialog. All retries are written to the audit trail.',
        tip: "If the email pill says \"Skipped — no recipient\", the REPORT_EMAIL environment variable is missing. Set it and resend.",
      },
    ],
    quickLink: "/preboard",
    quickLinkLabel: "Go to Assessments",
    warnings: [
      "Applicants can only access the assessment through their unique portal link.",
      "Assessment responses are time-limited — the timer is visible to the applicant during the assessment.",
      "If you see an AI or email failure that won't clear after a re-run, check the Anthropic / Microsoft Graph status pages — the retry already exhausted 4 attempts.",
    ],
  },
  {
    id: "portal",
    title: "Portal & Onboarding",
    icon: ShieldCheck,
    color: "text-cyan-400",
    overview:
      "The portal is where applicants and candidates complete their entire onboarding journey. They access it through a unique token link. The portal guides them through applicant assessment, document uploads, and compliance checks.",
    steps: [
      {
        action: "Understanding the portal experience",
        detail:
          'When someone clicks their portal link, they see a journey hub with three stages: Applicant Assessment, Candidate Onboarding, and Skills Arcade. They must complete each stage in order.',
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
        action: "Candidate onboarding data entry",
        detail:
          "Candidates fill in 10 sections on the onboarding page: Demographics (with Equal Opportunities embedded inline), NMC PIN, DBS, Right to Work (checklist linking to the Age & Eligibility declaration), Health & Disability, Competencies, Employment History, References, Training & Certs, and Policies & Agreements.",
      },
      {
        action: "Date of birth, passport & right-to-work evidence — single source of truth",
        detail:
          "DOB, passport / RTW document number, gov.uk share code and the right-to-work document upload all live on the Age & Eligibility declaration. The Demographics step no longer asks for them and the legacy Right to Work step is now a checklist that links straight to that declaration. The admin Demographics tab shows DOB and passport read-only, labelled 'from Age & Eligibility declaration' when a value is present there.",
      },
      {
        action: "Hepatitis B / BBV — single source of truth",
        detail:
          "Hep B vaccination, anti-HBs titre, HBsAg, Hep C and HIV status are all asked on the Occupational Health questionnaire. The EPP declaration shows a read-only BBV summary panel that mirrors those answers — to update them, the candidate edits Occupational Health.",
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
      "The Skills Arcade area contains 40 competency modules covering essential clinical scenarios. As an admin, you can manage modules, view reports, and manage user assignments.",
    steps: [
      {
        action: "Access the Skills Arcade dashboard",
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
          'Click "Manage Modules" or navigate to the Modules page under Clinical in the sidebar. Here you can view all modules, toggle active/inactive status, and see scenario counts.',
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
    id: "policies",
    title: "Policies (Read & Sign)",
    icon: FileText,
    color: "text-indigo-400",
    overview:
      "The Policies area is the master list of policies that nurses must read and acknowledge in their portal. You can author each policy by hand, or — to save time — import the title and body straight from a Word or PDF document.",
    steps: [
      {
        action: "Open the Policies page",
        detail: "Navigate to /admin/policies. Click \"New Policy\" to open the dialog (or click the edit pencil on an existing policy).",
      },
      {
        action: "Click \"Import from document\" → Choose file",
        detail: "Pick a single .pdf or .docx file (max 10 MB). The system reads the document, picks a sensible title from the first heading (or the filename), and fills in the policy text with paragraph breaks preserved.",
        tip: "Scanned image-only PDFs won't work — they need OCR first. Encrypted/password-protected PDFs are also rejected.",
      },
      {
        action: "Review and tweak the populated fields",
        detail: "The Title and Policy text fields are now filled in. Edit anything you'd like — fix the title, trim boilerplate, adjust paragraph breaks. Set the version, sort order, active flag, and acknowledgement requirement as normal.",
      },
      {
        action: "Click Save",
        detail: "Nothing is persisted until you save. The uploaded document is not stored — it's only used to populate the form. If you also want nurses to download the original PDF, paste a hosted link into the optional \"PDF URL\" field.",
      },
    ],
    quickLink: "/admin/policies",
    quickLinkLabel: "Go to Policies",
    tips: [
      "Bumping the version number forces every nurse to re-acknowledge the new version.",
      "Use the import flow for both new policies and edits — it overwrites the title/body in the form, but only persists when you click Save.",
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
          'Use the Module filter dropdown to view only entries from a specific area: Admin, Portal, System, Applicant, or Skills Arcade.',
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
              <Button variant="outline" size="sm" className="gap-2" tooltip="Jump straight to this section of the admin platform.">
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
            Step-by-step procedures for managing the Livaware platform.
            Follow these standard operating procedures to ensure consistent, compliant onboarding.
          </p>
        </div>

        <SuperAdminViewOnlyBanner className="mb-6" />

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
            <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs" tooltip="Open every standard operating procedure on this page.">
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs" tooltip="Close every standard operating procedure on this page.">
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
