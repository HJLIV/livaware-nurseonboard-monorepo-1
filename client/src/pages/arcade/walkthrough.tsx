import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  Target,
  Brain,
  ListChecks,
  ShieldAlert,
  Info,
  Lock,
  Trophy,
  RotateCcw,
  Users,
  CheckCircle2,
  Lightbulb,
  HeartPulse,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
} from "lucide-react";

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card className="animate-in fade-in-50 duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold" data-testid={`text-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>{title}</h2>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        {children}
      </CardContent>
    </Card>
  );
}

export default function WalkthroughPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="page-walkthrough">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Getting Started</p>
            <h1 className="font-serif text-2xl font-light tracking-tight" data-testid="text-walkthrough-title">Welcome to Skills Arcade</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your guide to clinical competency assessment</p>
          </div>
        </div>
      </div>

      <Section icon={HeartPulse} title="What is Skills Arcade?">
        <p>
          Skills Arcade is a clinical competency assessment platform designed for community and home care nurses.
          It uses realistic, scenario-based assessments to evaluate whether you can safely and effectively carry
          out the clinical procedures you perform every day with patients.
        </p>
        <p>
          The platform covers 40 clinical skills across areas including medication management, respiratory care,
          wound care, diabetes management, palliative care, catheter care, nutrition, clinical assessment, and stoma care.
        </p>
      </Section>

      <Section icon={Brain} title="Why test process knowledge?">
        <p>
          Clinical competency is more than being able to perform a physical skill. <span className="text-foreground font-medium">Half of competency
          is knowing what to do, when to do it, and in what order.</span> This is your process knowledge — the
          clinical reasoning and decision-making that keeps patients safe.
        </p>
        <p>
          A nurse might be perfectly capable of drawing up medication, but if they don't check the patient's
          identity first, verify the prescription, or confirm allergies, the outcome can be harmful. Process
          knowledge is the difference between going through the motions and providing safe, accountable care.
        </p>
        <p>
          Skills Arcade tests this critical dimension of competency. By asking you to sequence steps, match
          clinical concepts, make decisions at key branching points, and perform calculations, it assesses
          whether you understand the <span className="text-foreground font-medium">why</span> and <span className="text-foreground font-medium">when</span>, not just the how.
        </p>
      </Section>

      <Section icon={ListChecks} title="How assessments work">
        <p>Each module presents a realistic clinical scenario with a patient context. You'll encounter four types of task:</p>
        <div className="grid gap-3 pt-1">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="outline" className="mt-0.5 shrink-0">Ordering</Badge>
            <p>Put the steps of a clinical procedure in the correct sequence. This tests whether you know the right order of actions and haven't missed a critical step.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="outline" className="mt-0.5 shrink-0">Matching</Badge>
            <p>Match clinical observations, equipment, or interventions to their correct counterparts. This tests your clinical knowledge and ability to connect concepts.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="outline" className="mt-0.5 shrink-0">Decision</Badge>
            <p>Choose the correct action at a clinical decision point. The scenario branches based on your choice, reflecting how real clinical situations unfold.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="outline" className="mt-0.5 shrink-0">Calculation</Badge>
            <p>Work out drug dosages, flow rates, or clinical scores. Accuracy matters — you have a scratchpad to show your working.</p>
          </div>
        </div>
      </Section>

      <Section icon={Target} title="How scoring works">
        <p>
          Every answer is scored for clinical safety. Errors are classified into two categories:
        </p>
        <div className="grid gap-3 pt-1">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <ShieldAlert className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Major errors</p>
              <p>Actions that could directly cause patient harm — wrong drug, missed identity check, unsafe technique. Any single Major error means the assessment is not passed.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <Info className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Minor errors</p>
              <p>Steps that are out of sequence or not best practice but don't pose immediate danger — for example, documenting before disposal rather than after. Up to 3 Minor errors are allowed.</p>
            </div>
          </div>
        </div>
        <Separator />
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-emerald-500" />
            <p><span className="text-foreground font-medium">Pass:</span> 0 Major errors and 3 or fewer Minor errors</p>
          </div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" />
            <p><span className="text-foreground font-medium">Not yet competent:</span> Any Major error, or 4 or more Minor errors</p>
          </div>
        </div>
      </Section>

      <Section icon={RotateCcw} title="Attempts and support">
        <p>
          If you don't pass first time, that's okay. The results screen shows you exactly what went wrong,
          why it matters clinically, and what the correct action should have been. This feedback is designed
          to help you learn, not just to tell you that you failed.
        </p>
        <p>
          You have up to <span className="text-foreground font-medium">4 attempts</span> per module. Each attempt gives you fresh
          feedback to help you identify and correct gaps in your knowledge.
        </p>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <Lock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">After 4 unsuccessful attempts</p>
            <p>
              The module locks and you'll need to complete face-to-face training with a clinical trainer
              before you can try again. This is a safety measure — if the same errors keep appearing,
              hands-on support is the best way to build your confidence and close the gap.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={Users} title="The trainer and admin role">
        <p>
          <span className="text-foreground font-medium">Trainers</span> can see which nurses have been locked out of modules
          and review their attempt history. They can add notes from face-to-face sessions and, when satisfied
          the nurse is ready, unlock the module for another attempt.
        </p>
        <p>
          <span className="text-foreground font-medium">Administrators</span> manage the platform — assigning modules to nurses,
          managing user accounts, viewing progress reports, and reviewing module content. They also have access
          to the trainer remediation tools.
        </p>
      </Section>

      <Section icon={Lightbulb} title="Tips for success">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Read the patient context carefully.</span> The scenario is set up to reflect a real clinical situation. Details like the patient's condition, medications, and setting all matter.</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Think about safety first.</span> The scoring prioritises patient safety. When sequencing steps, ask yourself: what could go wrong if I skip this or do it later?</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Use the feedback.</span> If you don't pass, the results page explains each error with clinical reasoning. Take time to read and reflect before your next attempt.</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Don't rush.</span> There's no time limit. Work through each task carefully, as you would in a patient's home.</p>
          </div>
        </div>
      </Section>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="w-6 h-6 text-primary mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="text-foreground font-medium text-base">Ready to begin?</p>
              <p className="text-muted-foreground leading-relaxed">
                Head to your dashboard to see your assigned modules. Each one is a chance to demonstrate
                that you have the knowledge and clinical reasoning to deliver safe, effective care in the
                community. Good luck.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
