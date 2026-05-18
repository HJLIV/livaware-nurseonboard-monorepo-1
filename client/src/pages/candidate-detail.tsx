import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge, StepStatusDot } from "@/components/shared/status-badge";
import { StepProgress } from "@/components/shared/step-progress";
import { SpecialismSelector } from "@/components/specialism-selector";
import { AIMarkdown } from "@/components/ai-markdown";
import { renderEmailMarkdown } from "@shared/email-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingAccessPanel } from "@/components/admin/onboarding-access-panel";
import { DeclarationsPanel } from "@/components/admin/declarations-panel";
import { InductionProgressPanel } from "@/components/admin/induction-progress-panel";
import { SopComprehensionPanel } from "@/components/admin/sop-comprehension-panel";
import { PortalAccessPanel } from "@/components/admin/portal-access-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, User, Shield, FileCheck, Stethoscope, BookOpen, Heart,
  Users, FileText, ShieldCheck, Clock, CheckCircle, AlertTriangle,
  Plus, Mail, Phone, MapPin, Calendar, Award, Briefcase, Globe, Upload,
  Download, Copy, ExternalLink, FolderOpen, Link2, Loader2, Star,
  ClipboardCheck, AlertCircle, Sparkles, FileDown, Zap, Archive, ArchiveRestore, Trash2, UserCheck,
  ChevronDown, ChevronRight, Send, Activity, MoreHorizontal, Wand2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useSuspectBurstCharThreshold } from "@/hooks/use-preboard-integrity-settings";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useAuthRole } from "@/lib/use-auth-role";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useRef } from "react";
import { Pencil, Save, X, Lock as LockIcon, Unlock } from "lucide-react";
import { ONBOARDING_STEPS, COMPETENCY_MATRIX, MANDATORY_TRAINING_MODULES, INDUCTION_POLICIES, REFERENCE_QUESTIONS } from "@shared/schema";
import { isProofOfAddressWithinThreeMonths, getProofOfAddressValidity } from "@shared/poa-validity";
import type {
  Candidate, OnboardingState, NmcVerification, DbsVerification,
  CompetencyDeclaration, Reference, MandatoryTraining, HealthDeclaration,
  InductionPolicy, ProfessionalIndemnity, AuditLog, Document
} from "@shared/schema";

function DocumentLink({ doc }: { doc: any }) {
  if (!doc.filePath) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={doc.filePath}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        data-testid={`link-download-${doc.id}`}
      >
        <Download className="h-3 w-3" />
        {doc.originalFilename || doc.filename}
      </a>
      {doc.sharepointUrl && (
        <a
          href={doc.sharepointUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 hover:underline"
          data-testid={`link-sharepoint-${doc.id}`}
          title="Open in SharePoint"
        >
          <Globe className="h-3 w-3" />
          SharePoint
        </a>
      )}
    </span>
  );
}

interface NextOfKinData {
  name: string;
  relationship: string;
  contactNumber: string;
}

function parseNextOfKin(value: string | null | undefined): NextOfKinData {
  if (!value) return { name: "", relationship: "", contactNumber: "" };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        name: parsed.name || "",
        relationship: parsed.relationship || "",
        contactNumber: parsed.contactNumber || "",
      };
    }
  } catch {}
  return { name: value, relationship: "", contactNumber: "" };
}

function serializeNextOfKin(name: string, relationship: string, contactNumber: string): string {
  if (!name && !relationship && !contactNumber) return "";
  return JSON.stringify({ name, relationship, contactNumber });
}

function formatNextOfKin(value: string | null | undefined): string {
  const nok = parseNextOfKin(value);
  const parts = [nok.name, nok.relationship, nok.contactNumber].filter(Boolean);
  return parts.join(" — ");
}

function PreboardDeliveryPanel({
  aiStatus, aiError, aiAttempts,
  emailStatus, emailError, emailAttempts, emailSentAt,
  onRerunAi, onResendEmail, rerunPending, resendPending,
  isAdmin,
}: {
  isAdmin: boolean;
  aiStatus?: string | null;
  aiError?: string | null;
  aiAttempts?: number | null;
  emailStatus?: string | null;
  emailError?: string | null;
  emailAttempts?: number | null;
  emailSentAt?: string | null;
  onRerunAi: () => void;
  onResendEmail: () => void;
  rerunPending: boolean;
  resendPending: boolean;
}) {
  const ai = aiStatus || "pending";
  const em = emailStatus || "pending";

  const aiPill = ai === "ok"
    ? { label: "AI: ready", cls: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10" }
    : ai === "failed"
    ? { label: `AI failed${aiAttempts ? ` (${aiAttempts} tries)` : ""}`, cls: "border-destructive/40 text-destructive bg-destructive/10" }
    : { label: "AI pending", cls: "border-muted-foreground/30 text-muted-foreground bg-muted/30" };

  const emPill = em === "sent"
    ? { label: emailSentAt ? `Sent ${new Date(emailSentAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}` : "Email sent", cls: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10" }
    : em === "failed"
    ? { label: `Email failed${emailAttempts ? ` (${emailAttempts} tries)` : ""}`, cls: "border-destructive/40 text-destructive bg-destructive/10" }
    : em === "skipped_no_recipient"
    ? { label: "Skipped — no recipient configured", cls: "border-amber-500/40 text-amber-600 bg-amber-500/10" }
    : { label: "Email pending", cls: "border-muted-foreground/30 text-muted-foreground bg-muted/30" };

  return (
    <Card className="border border-card-border" data-testid="card-preboard-delivery">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Report Delivery</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${aiPill.cls}`} data-testid="pill-ai-status">{aiPill.label}</Badge>
            <Badge variant="outline" className={`text-[10px] ${emPill.cls}`} data-testid="pill-email-status">{emPill.label}</Badge>
          </div>
        </div>
        {(aiError || emailError) && (
          <div className="space-y-1">
            {aiError && ai === "failed" && (
              <p className="text-xs text-destructive/80"><span className="font-semibold">AI error:</span> {aiError}</p>
            )}
            {emailError && (em === "failed" || em === "skipped_no_recipient") && (
              <p className="text-xs text-destructive/80"><span className="font-semibold">Email error:</span> {emailError}</p>
            )}
          </div>
        )}
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onRerunAi}
              disabled={rerunPending}
              data-testid="button-rerun-ai"
              tooltip="Re-run the AI analysis on this candidate's preboard answers."
            >
              {rerunPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Re-run AI analysis
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onResendEmail}
              disabled={resendPending}
              data-testid="button-resend-email"
              title={em === "skipped_no_recipient" ? "Set REPORT_EMAIL, then click to send" : undefined}
              tooltip="Resend the preboard report email to the configured recipient."
            >
              {resendPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Resend report email
            </Button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/70" data-testid="text-delivery-readonly">
            Re-run / resend actions are admin-only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PortalBadge() {
  return (
    <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/50">
      Portal
    </Badge>
  );
}

function PassportPhotoUpload({ candidate }: { candidate: Candidate }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/candidates/${candidate.id}/passport-photo`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
      toast({ title: "Passport photo uploaded" });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/candidates/${candidate.id}/passport-photo`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
      toast({ title: "Passport photo removed" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  if (candidate.passportPhotoPath) {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Passport Photo</Label>
        <div className="relative group inline-block">
          <img
            src={candidate.passportPhotoPath}
            alt="Passport photo"
            className="h-32 w-auto rounded-lg border border-border object-cover"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} tooltip="Upload a new passport photo to replace the existing one.">
              <Upload className="h-3 w-3 mr-1" /> Replace
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending} tooltip="Permanently remove this passport photo from the candidate's record.">
              <X className="h-3 w-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Passport Photo</Label>
      <div
        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadMutation.isPending ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload className="h-5 w-5 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">Click to upload passport photo</span>
            <span className="text-[10px] text-muted-foreground/50">JPG, PNG or WebP up to 10MB</span>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
    </div>
  );
}

function IdentityVerificationStatus({ candidate }: { candidate: Candidate }) {
  const { data: documents = [] } = useQuery<any[]>({
    queryKey: [`/api/candidates/${candidate.id}/documents`],
  });

  const rtwDocs = documents.filter((d: any) => d.category === "right_to_work");
  const hasPhotoId = !!candidate.passportPhotoPath || rtwDocs.length > 0;

  const proofDocs = documents.filter((d: any) => d.category === "proof_of_address");
  const validProofDocs = proofDocs.filter((d: any) => isProofOfAddressWithinThreeMonths(d.expiryDate));
  const hasValidProofOfAddress = validProofDocs.length > 0;

  const allMet = hasPhotoId && hasValidProofOfAddress;

  return (
    <Card className={`border ${allMet ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className={`h-4 w-4 ${allMet ? "text-emerald-500" : "text-amber-500"}`} />
          <p className="text-sm font-semibold">Identity Verification</p>
          {allMet ? (
            <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 bg-emerald-500/10 ml-auto">Complete</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10 ml-auto">Incomplete</Badge>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {hasPhotoId ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            )}
            <span className="text-xs">{hasPhotoId ? "Photo ID uploaded" : "Photo ID required"}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasValidProofOfAddress ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            )}
            <span className="text-xs">{hasValidProofOfAddress ? "Proof of address uploaded (within 3 months)" : "Proof of address required (within 3 months)"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IdentityTab({ candidate }: { candidate: Candidate }) {
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: candidate.fullName || "",
    email: candidate.email || "",
    phone: candidate.phone || "",
    address: candidate.address || "",
    preferredPronouns: candidate.preferredPronouns || "",
    nokName: parseNextOfKin(candidate.nextOfKin).name,
    nokRelationship: parseNextOfKin(candidate.nextOfKin).relationship,
    nokContact: parseNextOfKin(candidate.nextOfKin).contactNumber,
    nmcPin: candidate.nmcPin || "",
    dbsNumber: candidate.dbsNumber || "",
    band: candidate.band?.toString() || "",
    currentEmployer: candidate.currentEmployer || "",
    yearsQualified: candidate.yearsQualified?.toString() || "",
  });
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());

  // Read-through fallback: DOB + passport are owned by the
  // age_and_eligibility declaration (task 125). Show those answers as the
  // authoritative source; legacy nurses.* columns are display-only.
  const { data: ageDecl } = useQuery<any>({
    queryKey: ["/api/nurses", candidate.id, "declarations", "age_and_eligibility"],
    queryFn: async () => {
      const res = await fetch(`/api/nurses/${candidate.id}/declarations/age_and_eligibility`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
  const declAnswers = (ageDecl?.latest?.answers as Record<string, any> | undefined) || {};
  const declDob = declAnswers.date_of_birth || null;
  const declPassportRef = declAnswers.rtw_document_reference || declAnswers.passport_number || null;
  const displayDob = declDob || candidate.dateOfBirth || null;
  const displayPassport = declPassportRef || candidate.passportNumber || null;
  const dobFromDecl = !!declDob;
  const passportFromDecl = !!declPassportRef;

  const isFieldLocked = (field: string, originalValue: string | null | undefined) => {
    const val = originalValue ?? "";
    return val !== "" && !unlockedFields.has(field);
  };

  const unlockField = (field: string) => {
    setUnlockedFields(prev => new Set(prev).add(field));
  };

  const startEditing = useCallback(() => {
    setForm({
      fullName: candidate.fullName || "",
      email: candidate.email || "",
      phone: candidate.phone || "",
      address: candidate.address || "",
      preferredPronouns: candidate.preferredPronouns || "",
      nokName: parseNextOfKin(candidate.nextOfKin).name,
      nokRelationship: parseNextOfKin(candidate.nextOfKin).relationship,
      nokContact: parseNextOfKin(candidate.nextOfKin).contactNumber,
      nmcPin: candidate.nmcPin || "",
      dbsNumber: candidate.dbsNumber || "",
      band: candidate.band?.toString() || "",
      currentEmployer: candidate.currentEmployer || "",
      yearsQualified: candidate.yearsQualified?.toString() || "",
    });
    setUnlockedFields(new Set());
    setEditing(true);
  }, [candidate]);

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {};
      if (form.fullName !== (candidate.fullName || "")) payload.fullName = form.fullName;
      if (form.email !== (candidate.email || "")) payload.email = form.email;
      if (form.phone !== (candidate.phone || "")) payload.phone = form.phone || null;
      if (form.address !== (candidate.address || "")) payload.address = form.address || null;
      if (form.preferredPronouns !== (candidate.preferredPronouns || "")) payload.preferredPronouns = form.preferredPronouns || null;
      const newNok = serializeNextOfKin(form.nokName, form.nokRelationship, form.nokContact);
      if (newNok !== (candidate.nextOfKin || "")) payload.nextOfKin = newNok || null;
      if (form.nmcPin !== (candidate.nmcPin || "")) payload.nmcPin = form.nmcPin || null;
      if (form.dbsNumber !== (candidate.dbsNumber || "")) payload.dbsNumber = form.dbsNumber || null;
      if (form.band !== (candidate.band?.toString() || "")) payload.band = form.band ? parseInt(form.band) : null;
      if (form.currentEmployer !== (candidate.currentEmployer || "")) payload.currentEmployer = form.currentEmployer || null;
      if (form.yearsQualified !== (candidate.yearsQualified?.toString() || "")) payload.yearsQualified = form.yearsQualified ? parseInt(form.yearsQualified) : null;
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }
      const res = await apiRequest("PATCH", `/api/nurses/${candidate.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
      setEditing(false);
      toast({ title: "Profile Updated", description: "Changes saved and logged to audit trail." });
    },
    onError: (err: any) => {
      toast({ title: "Update Failed", description: err.message || "Could not save changes.", variant: "destructive" });
    },
  });

  if (!editing) {
    return (
      <div data-testid="tab-identity">
        <div className="flex items-center justify-between mb-4">
          <div />
          <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-identity" tooltip="Edit this candidate's identity and professional details. Changes are audit-logged.">
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit Details
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Demographics</h3>
            <div className="space-y-3">
              <InfoRow icon={<User className="h-4 w-4" />} label="Full Name" value={candidate.fullName} />
              <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={candidate.email} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={candidate.phone} />
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label={`Date of Birth${dobFromDecl ? " (from Age & Eligibility declaration)" : ""}`}
                value={displayDob || undefined}
              />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={candidate.address} />
              <InfoRow label="Preferred Pronouns" value={candidate.preferredPronouns} />
              <InfoRow label="Next of Kin — Name" value={parseNextOfKin(candidate.nextOfKin).name || undefined} />
              <InfoRow label="Next of Kin — Relationship" value={parseNextOfKin(candidate.nextOfKin).relationship || undefined} />
              <InfoRow label="Next of Kin — Contact" value={parseNextOfKin(candidate.nextOfKin).contactNumber || undefined} />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Professional Details</h3>
            <div className="space-y-3">
              <InfoRow
                icon={<FileText className="h-4 w-4" />}
                label={`Passport / RTW reference${passportFromDecl ? " (from Age & Eligibility declaration)" : ""}`}
                value={displayPassport || undefined}
              />
              <InfoRow icon={<Award className="h-4 w-4" />} label="NMC PIN" value={candidate.nmcPin} />
              <InfoRow icon={<Shield className="h-4 w-4" />} label="DBS Number" value={candidate.dbsNumber} />
              <InfoRow label="Band" value={candidate.band ? `Band ${candidate.band}` : undefined} />
              <InfoRow label="Current Employer" value={candidate.currentEmployer} />
              <InfoRow label="Years Qualified" value={candidate.yearsQualified?.toString()} />
              <InfoRow label="Specialisms" value={candidate.specialisms?.join(", ")} />
            </div>
          </div>
        </div>
        <IdentityVerificationStatus candidate={candidate} />
      </div>
    );
  }

  return (
    <div data-testid="tab-identity-edit">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/20">
            <Pencil className="h-3 w-3 mr-1" />
            Editing
          </Badge>
          <span className="text-xs text-muted-foreground">Changes will be logged in the audit trail</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)} data-testid="button-cancel-edit">
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-edit" tooltip="Save your changes to this candidate's identity details.">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Demographics</h3>
          <div className="rounded-md border border-card-border bg-muted/20 p-2.5 text-[11px] text-muted-foreground" data-testid="hint-dob-passport-decl">
            Date of birth, passport &amp; right-to-work fields are owned by the <em>Age &amp; Eligibility</em> declaration and aren't editable here.
          </div>
          <div className="space-y-3">
            <LockedInput label="Full Name" value={form.fullName} onChange={v => updateField("fullName", v)} locked={isFieldLocked("fullName", candidate.fullName)} onUnlock={() => unlockField("fullName")} testId="input-edit-fullName" />
            <LockedInput label="Email" value={form.email} onChange={v => updateField("email", v)} locked={isFieldLocked("email", candidate.email)} onUnlock={() => unlockField("email")} type="email" testId="input-edit-email" />
            <LockedInput label="Phone" value={form.phone} onChange={v => updateField("phone", v)} locked={isFieldLocked("phone", candidate.phone)} onUnlock={() => unlockField("phone")} placeholder="e.g. 07700 900123" testId="input-edit-phone" />
            <LockedInput label="Address" value={form.address} onChange={v => updateField("address", v)} locked={isFieldLocked("address", candidate.address)} onUnlock={() => unlockField("address")} rows={2} testId="input-edit-address" />
            <LockedInput label="Preferred Pronouns" value={form.preferredPronouns} onChange={v => updateField("preferredPronouns", v)} locked={isFieldLocked("preferredPronouns", candidate.preferredPronouns)} onUnlock={() => unlockField("preferredPronouns")} placeholder="e.g. she/her" testId="input-edit-pronouns" />
            <LockedInput label="Next of Kin — Name" value={form.nokName} onChange={v => updateField("nokName", v)} locked={isFieldLocked("nokName", parseNextOfKin(candidate.nextOfKin).name)} onUnlock={() => unlockField("nokName")} placeholder="e.g. Jane Smith" testId="input-edit-nok-name" />
            <LockedInput label="Next of Kin — Relationship" value={form.nokRelationship} onChange={v => updateField("nokRelationship", v)} locked={isFieldLocked("nokRelationship", parseNextOfKin(candidate.nextOfKin).relationship)} onUnlock={() => unlockField("nokRelationship")} placeholder="e.g. Spouse, Parent, Sibling" testId="input-edit-nok-relationship" />
            <LockedInput label="Next of Kin — Contact Number" value={form.nokContact} onChange={v => updateField("nokContact", v)} locked={isFieldLocked("nokContact", parseNextOfKin(candidate.nextOfKin).contactNumber)} onUnlock={() => unlockField("nokContact")} placeholder="e.g. 07700 900456" testId="input-edit-nok-contact" />
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Professional Details</h3>
          <div className="space-y-3">
            <LockedInput label="NMC PIN" value={form.nmcPin} onChange={v => updateField("nmcPin", v)} locked={isFieldLocked("nmcPin", candidate.nmcPin)} onUnlock={() => unlockField("nmcPin")} placeholder="e.g. 12A3456B" testId="input-edit-nmc" />
            <LockedInput label="DBS Number" value={form.dbsNumber} onChange={v => updateField("dbsNumber", v)} locked={isFieldLocked("dbsNumber", candidate.dbsNumber)} onUnlock={() => unlockField("dbsNumber")} placeholder="e.g. 001234567890" testId="input-edit-dbs" />
            <LockedInput label="Band" value={form.band} onChange={v => updateField("band", v)} locked={isFieldLocked("band", candidate.band?.toString())} onUnlock={() => unlockField("band")} type="number" min="1" max="9" placeholder="e.g. 5" testId="input-edit-band" />
            <LockedInput label="Current Employer" value={form.currentEmployer} onChange={v => updateField("currentEmployer", v)} locked={isFieldLocked("currentEmployer", candidate.currentEmployer)} onUnlock={() => unlockField("currentEmployer")} testId="input-edit-employer" />
            <LockedInput label="Years Qualified" value={form.yearsQualified} onChange={v => updateField("yearsQualified", v)} locked={isFieldLocked("yearsQualified", candidate.yearsQualified?.toString())} onUnlock={() => unlockField("yearsQualified")} type="number" min="0" testId="input-edit-years" />
          </div>
        </div>
      </div>
      <IdentityVerificationStatus candidate={candidate} />
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: string | null }) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{value || "Not provided"}</p>
          {hasValue && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
              <CheckCircle className="h-3 w-3" />
              <LockIcon className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LockedInput({ label, value, onChange, locked, onUnlock, type, placeholder, min, max, rows, testId }: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  locked: boolean;
  onUnlock: () => void;
  type?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  rows?: number;
  testId?: string;
}) {
  if (locked) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-950/10 text-sm">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">{value}</span>
            <LockIcon className="h-3 w-3 text-emerald-500/60 shrink-0 ml-auto" />
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-400" onClick={onUnlock} data-testid={testId ? `${testId}-unlock` : undefined} tooltip="Unlock this verified field so you can edit its value.">
            <Unlock className="h-3 w-3 mr-1" />
            Unlock
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {rows ? (
        <Textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} data-testid={testId} />
      ) : (
        <Input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} min={min} max={max} data-testid={testId} />
      )}
    </div>
  );
}

function VerificationBanner({
  status,
  type,
  verifiedAt,
  candidateId,
  children,
}: {
  status: "verified" | "pending" | "escalated" | string;
  type: "NMC" | "DBS";
  verifiedAt?: Date | string | null;
  candidateId: string;
  children?: React.ReactNode;
}) {
  const isVerified = status === "verified";
  const isFailed = status === "failed";
  const isEscalated = status === "escalated";
  const auditAction = type === "NMC" ? "nmc_verification_created" : "dbs_verification_created";
  const { data: auditLogs } = useQuery<AuditLog[]>({
    queryKey: ["/api/candidates", candidateId, "audit-log"],
  });

  const relevantLogs = (auditLogs || [])
    .filter(log => log.action === auditAction || (type === "NMC" && log.action === "nurse_updated" && (log.detail as any)?.nmcPin))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const lastVerification = relevantLogs.find(l => l.action === auditAction);
  const lastPinEntry = type === "NMC" ? relevantLogs.find(l => l.action === "nurse_updated" && (l.detail as any)?.nmcPin) : null;

  const bannerStyle = isVerified
    ? "border-emerald-500/50 bg-emerald-950/20"
    : isFailed
    ? "border-red-500/50 bg-red-950/20"
    : isEscalated
    ? "border-orange-500/50 bg-orange-950/20"
    : "border-amber-500/50 bg-amber-950/20";

  const iconColor = isVerified ? "text-emerald-400" : isFailed ? "text-red-400" : isEscalated ? "text-orange-400" : "text-amber-400";
  const textColor = isVerified ? "text-emerald-300" : isFailed ? "text-red-300" : isEscalated ? "text-orange-300" : "text-amber-300";
  const statusLabel = isVerified ? "Verified" : isFailed ? "Failed" : isEscalated ? "Escalated — Review Required" : "Pending Verification";
  const badgeStatus = isVerified ? "cleared" : isFailed ? "blocked" : "escalated";

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${bannerStyle}`} data-testid={`verification-banner-${type.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isVerified ? (
            <CheckCircle className="h-5 w-5 text-emerald-400" />
          ) : (
            <AlertTriangle className={`h-5 w-5 ${iconColor}`} />
          )}
          <span className={`text-sm font-semibold ${textColor}`}>
            {type} {statusLabel}
          </span>
        </div>
        <StatusBadge status={badgeStatus} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        {verifiedAt && (
          <div>
            <span className="text-muted-foreground">Verified Date</span>
            <p className="font-medium text-foreground">
              {new Date(verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        )}
        {lastVerification && (
          <>
            <div>
              <span className="text-muted-foreground">Checked By</span>
              <p className="font-medium text-foreground">{lastVerification.agentName || "Admin"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Logged At</span>
              <p className="font-medium text-foreground">
                {new Date(lastVerification.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {" "}
                {new Date(lastVerification.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </>
        )}
        {lastPinEntry && (
          <div>
            <span className="text-muted-foreground">PIN Entered</span>
            <p className="font-medium text-foreground">
              {new Date(lastPinEntry.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {" by "}{lastPinEntry.agentName || "Admin"}
            </p>
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

interface NmcRawResponse {
  pdfVerification?: boolean;
  evidenceFilename?: string | null;
  originalFilename?: string | null;
  documentId?: string | null;
  extractionMethod?: "parsed" | "ai-extracted";
  source?: string;
}

function getNmcExtractionMethod(verification: NmcVerification): string | undefined {
  const raw = verification.rawResponse as NmcRawResponse | null;
  return raw?.extractionMethod;
}

const NMC_PIN_REGEX_GLOBAL = /^\d{2}[A-Z]\d{4}[A-Z]$/;

interface NmcReviewSource {
  pin?: string;
  registeredName?: string;
  registrationStatus?: string;
  fieldOfPractice?: string;
  effectiveDate?: string | null;
  renewalDate?: string | null;
  conditions?: string[];
  extractionMethod?: "parsed" | "ai-extracted";
  uploadedFilename?: string;
  originalFilename?: string;
  source?: string;
}

interface NmcDocumentSummary {
  id: string;
  filename: string;
  originalFilename: string | null;
  filePath: string | null;
}

type NmcVerificationWithDocument = NmcVerification & { document?: NmcDocumentSummary | null };

interface NmcConfirmPayload {
  pin: string;
  registeredName: string;
  registrationStatus: string;
  fieldOfPractice: string;
  effectiveDate: string | null;
  renewalDate: string | null;
  conditions: string[];
  uploadedFilename?: string;
  originalFilename?: string;
  extractionMethod: "parsed" | "ai-extracted";
}

interface NmcConfirmMutation {
  mutate: (data: NmcConfirmPayload) => void;
  isPending: boolean;
}

function NmcReviewPanel({
  source,
  verification,
  resolvedPin,
  confirmMutation,
  onCancel,
}: {
  source: NmcReviewSource;
  verification: NmcVerificationWithDocument | null;
  resolvedPin: string;
  confirmMutation: NmcConfirmMutation;
  onCancel?: () => void;
}) {
  const [pinField, setPinField] = useState<string>(source.pin || resolvedPin || "");
  const [registeredName, setRegisteredName] = useState<string>(source.registeredName || "");
  const [registrationStatus, setRegistrationStatus] = useState<string>(source.registrationStatus || "");
  const [fieldOfPractice, setFieldOfPractice] = useState<string>(source.fieldOfPractice || "");
  const [effectiveDate, setEffectiveDate] = useState<string>(source.effectiveDate || "");
  const [renewalDate, setRenewalDate] = useState<string>(source.renewalDate || "");
  const [conditionsText, setConditionsText] = useState<string>(((source.conditions as string[] | undefined) || []).join("\n"));

  const pinUpper = (pinField || "").toUpperCase().trim();
  const pinMissing = !pinUpper;
  const pinInvalid = !pinMissing && !NMC_PIN_REGEX_GLOBAL.test(pinUpper);
  const statusMissing = !registrationStatus.trim();

  const validationMessages: string[] = [];
  if (pinMissing) validationMessages.push("Enter the nurse's NMC PIN to enable confirm.");
  else if (pinInvalid) validationMessages.push("PIN must be 2 digits, 1 letter, 4 digits, 1 letter (e.g. 18A1234C).");
  if (statusMissing) validationMessages.push("Enter the registration status (e.g. Registered).");

  const canSubmit = !pinMissing && !pinInvalid && !statusMissing && !confirmMutation.isPending;

  const statusLower = registrationStatus.toLowerCase();
  const isRegistered = statusLower.includes("registered") && !statusLower.includes("condition") && !statusLower.includes("caution") && !statusLower.includes("suspend");

  const document = verification?.document ?? null;
  const docFilename = document?.originalFilename || document?.filename || source.originalFilename || source.uploadedFilename;
  const docPath = document?.filePath || (source.uploadedFilename ? `/api/uploads/${source.uploadedFilename}` : null);
  const isPortalSubmission = !!verification && (verification.rawResponse as NmcRawResponse | null)?.source === "portal_upload";

  return (
    <div className="space-y-4" data-testid="tab-nmc">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 p-4 space-y-1">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-blue-400" />
          <p className="text-sm font-medium">
            {isPortalSubmission ? "Submitted by nurse — Review & confirm" : "PDF Parsed — Review Details"}
          </p>
          {source.extractionMethod === "ai-extracted" && (
            <Badge variant="outline" className="text-[10px] bg-purple-950/60 text-purple-300 border-purple-800/50" data-testid="badge-ai-extracted">
              <Sparkles className="h-3 w-3 mr-1" />
              AI-extracted
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isPortalSubmission
            ? "The nurse uploaded their NMC register PDF via the portal. Review the parsed details below, edit any field if needed, and confirm to save the verification."
            : source.extractionMethod === "ai-extracted"
              ? "Standard parsing returned incomplete results. These details were extracted using AI. Please review carefully and confirm."
              : "These details were extracted from the uploaded NMC register PDF. Please review and confirm."}
        </p>
        {docPath && (
          <p className="text-xs mt-2">
            <a href={docPath} target="_blank" rel="noopener noreferrer" className="underline text-blue-400 hover:text-blue-300" data-testid="link-nmc-pdf">
              View uploaded PDF{docFilename ? ` (${docFilename})` : ""}
            </a>
          </p>
        )}
      </div>

      <div className={`rounded-lg border p-4 space-y-3 ${isRegistered ? "border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20"}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isRegistered ? "bg-green-500" : "bg-amber-500"}`} />
          <span className="text-sm font-semibold">{registrationStatus || "Status not extracted — enter below"}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="nmc-confirm-pin" className="text-muted-foreground text-xs">NMC PIN</Label>
            <Input
              id="nmc-confirm-pin"
              value={pinField}
              onChange={(e) => setPinField(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              placeholder="e.g. 18A1234C"
              data-testid="input-confirm-pin"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nmc-confirm-name" className="text-muted-foreground text-xs">Registered Name</Label>
            <Input id="nmc-confirm-name" value={registeredName} onChange={(e) => setRegisteredName(e.target.value)} data-testid="input-confirm-name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nmc-confirm-status" className="text-muted-foreground text-xs">Registration Status</Label>
            <Input id="nmc-confirm-status" value={registrationStatus} onChange={(e) => setRegistrationStatus(e.target.value)} placeholder="e.g. Registered" data-testid="input-confirm-status" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nmc-confirm-field" className="text-muted-foreground text-xs">Field of Practice</Label>
            <Input id="nmc-confirm-field" value={fieldOfPractice} onChange={(e) => setFieldOfPractice(e.target.value)} data-testid="input-confirm-field" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nmc-confirm-effective" className="text-muted-foreground text-xs">Effective Date</Label>
            <Input id="nmc-confirm-effective" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} placeholder="DD/MM/YYYY" data-testid="input-confirm-effective" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nmc-confirm-renewal" className="text-muted-foreground text-xs">Renewal Date</Label>
            <Input id="nmc-confirm-renewal" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} placeholder="DD/MM/YYYY" data-testid="input-confirm-renewal" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="nmc-confirm-conditions" className="text-muted-foreground text-xs">Conditions / Cautions (one per line)</Label>
            <Textarea
              id="nmc-confirm-conditions"
              value={conditionsText}
              onChange={(e) => setConditionsText(e.target.value)}
              placeholder="Leave empty if none"
              rows={2}
              data-testid="input-confirm-conditions"
            />
          </div>
        </div>
      </div>

      {validationMessages.length > 0 && (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1" data-testid="nmc-validation-messages">
          {validationMessages.map((m, i) => <p key={i}>• {m}</p>)}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={() => confirmMutation.mutate({
            pin: pinUpper,
            registeredName,
            registrationStatus,
            fieldOfPractice,
            effectiveDate: effectiveDate || null,
            renewalDate: renewalDate || null,
            conditions: conditionsText.split("\n").map(s => s.trim()).filter(Boolean),
            uploadedFilename: source.uploadedFilename,
            originalFilename: source.originalFilename,
            extractionMethod: source.extractionMethod || "parsed",
          })}
          disabled={!canSubmit}
          data-testid="button-confirm-nmc"
          tooltip="Save the parsed NMC verification details to this candidate's record."
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          {confirmMutation.isPending ? "Confirming..." : "Confirm & Save Verification"}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel-nmc">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function NmcTab({ candidateId }: { candidateId: string }) {
  const { data: verification, isLoading } = useQuery<NmcVerification | null>({
    queryKey: ["/api/candidates", candidateId, "nmc-verification"],
  });
  const { data: candidate } = useQuery<Candidate>({
    queryKey: ["/api/candidates", candidateId],
  });
  const [parsedData, setParsedData] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [showRecheck, setShowRecheck] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaved, setPinSaved] = useState(false);
  const { toast } = useToast();

  const resolvedPin = (candidate?.nmcPin || "").trim();
  const NMC_URL = "https://www.nmc.org.uk/registration/search-the-register/";

  const NMC_PIN_REGEX = /^\d{2}[A-Z]\d{4}[A-Z]$/;

  const validateNmcPin = (pin: string): string | null => {
    if (!pin) return "NMC PIN is required";
    const upper = pin.toUpperCase().trim();
    if (upper.length !== 8) return "NMC PIN must be exactly 8 characters (e.g. 12A3456B)";
    if (!NMC_PIN_REGEX.test(upper)) return "Invalid format — must be 2 digits, 1 letter, 4 digits, 1 letter (e.g. 12A3456B)";
    return null;
  };

  const handlePinChange = (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    setPinInput(upper);
    setPinSaved(false);
    if (upper.length > 0) {
      setPinError(validateNmcPin(upper));
    } else {
      setPinError(null);
    }
  };

  const savePinMutation = useMutation({
    mutationFn: async () => {
      const error = validateNmcPin(pinInput);
      if (error) throw new Error(error);
      const res = await apiRequest("PATCH", `/api/nurses/${candidate?.id}`, { nmcPin: pinInput });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      setPinSaved(true);
      toast({ title: "NMC PIN Saved", description: `PIN ${pinInput} saved to candidate record.` });
    },
    onError: (err: any) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/candidates/${candidateId}/nmc-parse-pdf`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const data = await res.json();
      setParsedData(data);
      toast({ title: "PDF Parsed", description: "Registration details extracted. Please review and confirm below." });
    } catch (err: any) {
      toast({ title: "Parse Failed", description: err.message || "Could not read the PDF.", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const confirmMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/nmc-verify`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "nmc-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      setParsedData(null);
      setShowRecheck(false);
      toast({ title: "NMC Verification Confirmed", description: "Registration verified and evidence saved." });
    },
    onError: (err: any) => {
      // err.message looks like `400: {"message":"Invalid NMC PIN format..."}` —
      // unwrap the JSON to surface the real server reason instead of the raw status line.
      let description: string = err?.message || "Could not save NMC verification.";
      const match = typeof err?.message === "string" ? err.message.match(/^\d+:\s*([\s\S]*)$/) : null;
      if (match) {
        const tail = match[1].trim();
        try {
          const parsed = JSON.parse(tail);
          if (parsed && typeof parsed.message === "string") description = parsed.message;
          else description = tail;
        } catch {
          description = tail;
        }
      }
      toast({ title: "Could not confirm NMC verification", description, variant: "destructive" });
    },
  });

  // Pending verifications (e.g. created by a portal nurse upload) should
  // surface in the same review/confirm panel as a fresh admin-side upload.
  const pendingVerification = verification && verification.status === "pending"
    ? (verification as NmcVerificationWithDocument)
    : null;
  const parsedSource: NmcReviewSource | null = parsedData
    ? {
        pin: parsedData.pin || undefined,
        registeredName: parsedData.registeredName || "",
        registrationStatus: parsedData.registrationStatus || "",
        fieldOfPractice: parsedData.fieldOfPractice || "",
        effectiveDate: parsedData.effectiveDate || null,
        renewalDate: parsedData.renewalDate || null,
        conditions: Array.isArray(parsedData.conditions) ? parsedData.conditions : [],
        extractionMethod: parsedData.extractionMethod === "ai-extracted" ? "ai-extracted" : "parsed",
        uploadedFilename: parsedData.uploadedFilename,
        originalFilename: parsedData.originalFilename,
        source: "admin_upload",
      }
    : null;
  const pendingSource: NmcReviewSource | null = pendingVerification
    ? {
        pin: pendingVerification.pin && pendingVerification.pin !== "PENDING" ? pendingVerification.pin : "",
        registeredName: pendingVerification.registeredName || "",
        registrationStatus: pendingVerification.registrationStatus || "",
        fieldOfPractice: pendingVerification.fieldOfPractice || "",
        effectiveDate: pendingVerification.effectiveDate || null,
        renewalDate: pendingVerification.renewalDate || null,
        conditions: (pendingVerification.conditions as string[] | null) || [],
        extractionMethod: getNmcExtractionMethod(pendingVerification) === "ai-extracted" ? "ai-extracted" : "parsed",
        uploadedFilename: (pendingVerification.rawResponse as NmcRawResponse | null)?.evidenceFilename || undefined,
        originalFilename: (pendingVerification.rawResponse as NmcRawResponse | null)?.originalFilename || undefined,
        source: "portal_upload",
      }
    : null;
  const reviewSource: NmcReviewSource | null = parsedSource ?? pendingSource;

  if (isLoading) return <Skeleton className="h-40" />;

  if (verification && verification.status !== "pending" && !showRecheck && !parsedData) {
    return (
      <div className="space-y-4" data-testid="tab-nmc">
        <VerificationBanner
          status={verification.status}
          type="NMC"
          verifiedAt={verification.verifiedAt}
          candidateId={candidateId}
        >
          {getNmcExtractionMethod(verification) === "ai-extracted" && (
            <Badge variant="outline" className="text-[10px] bg-purple-950/60 text-purple-300 border-purple-800/50" data-testid="badge-ai-extracted-verified">
              <Sparkles className="h-3 w-3 mr-1" />
              AI-extracted
            </Badge>
          )}
        </VerificationBanner>

        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="NMC PIN" value={verification.pin} />
          <InfoRow label="Registered Name" value={verification.registeredName} />
          <InfoRow label="Registration Status" value={verification.registrationStatus} />
          <InfoRow label="Field of Practice" value={verification.fieldOfPractice} />
          <InfoRow label="Effective Date" value={verification.effectiveDate} />
          <InfoRow label="Renewal Date" value={verification.renewalDate} />
        </div>
        {verification.conditions && (verification.conditions as string[]).length > 0 && (
          <div className="rounded-lg border border-orange-800/50 bg-orange-950/30 p-3">
            <p className="text-sm font-medium text-orange-300">Conditions/Cautions:</p>
            <ul className="mt-1 text-sm text-orange-400">
              {(verification.conditions as string[]).map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
        <Separator />
        <Button
          variant="outline"
          onClick={() => setShowRecheck(true)}
          data-testid="button-recheck-nmc"
          tooltip="Re-verify this nurse against the NMC register with a fresh PDF upload."
        >
          <Stethoscope className="h-4 w-4 mr-2" />
          Re-verify Registration
        </Button>
      </div>
    );
  }

  if (reviewSource) {
    return (
      <NmcReviewPanel
        source={reviewSource}
        verification={pendingVerification}
        resolvedPin={resolvedPin}
        confirmMutation={confirmMutation}
        onCancel={parsedData ? () => setParsedData(null) : undefined}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="tab-nmc">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 p-4 space-y-3">
        <p className="text-sm font-medium">NMC Register Verification</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">1</span>
            Enter or confirm the candidate's NMC PIN below
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">2</span>
            Search the NMC register using the PIN
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">3</span>
            Download the registration page as PDF
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">4</span>
            Upload the PDF below — details will be extracted automatically
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(NMC_URL, "_blank")}
          data-testid="button-open-nmc-register"
          tooltip="Open the NMC online register in a new tab to verify the PIN."
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open NMC Register
        </Button>
      </div>

      <div className="space-y-3 max-w-lg">
        <Label className="text-sm font-medium">NMC PIN</Label>
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                value={pinInput || resolvedPin}
                onChange={e => handlePinChange(e.target.value)}
                placeholder="e.g. 12A3456B"
                maxLength={8}
                className={`font-mono tracking-wider uppercase ${pinError && pinInput.length > 0 ? "border-red-500 focus-visible:ring-red-500" : ""} ${pinSaved || (resolvedPin && !pinInput) ? "border-emerald-500/50" : ""}`}
                data-testid="input-nmc-pin"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => savePinMutation.mutate()}
              disabled={!pinInput || !!pinError || savePinMutation.isPending || pinInput === resolvedPin}
              data-testid="button-save-nmc-pin"
              tooltip="Save this NMC PIN to the candidate's record."
            >
              {savePinMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {pinError && pinInput.length > 0 && (
            <p className="text-xs text-red-400 flex items-center gap-1" data-testid="nmc-pin-error">
              <AlertCircle className="h-3 w-3" />
              {pinError}
            </p>
          )}
          {pinSaved && (
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              PIN saved to candidate record
            </p>
          )}
          {resolvedPin && !pinInput && (
            <p className="text-xs text-muted-foreground">
              Current PIN on file: <span className="font-mono font-medium">{resolvedPin}</span>
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Format: 2 digits + 1 letter + 4 digits + 1 letter (e.g. 12A3456B)
          </p>
        </div>
      </div>

      <div className="space-y-3 max-w-lg">
        <Label className="text-sm font-medium">Upload NMC Register PDF</Label>
        <div className="relative">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePdfUpload}
            className="hidden"
            id="nmc-pdf-upload"
            data-testid="input-nmc-pdf"
          />
          <label
            htmlFor="nmc-pdf-upload"
            className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/5 ${uploading ? "opacity-50 pointer-events-none" : "border-muted-foreground/25"}`}
          >
            {uploading ? (
              <>
                <Clock className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Parsing PDF...</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to upload NMC register PDF</span>
              </>
            )}
          </label>
        </div>
      </div>

      {showRecheck && (
        <Button variant="outline" size="sm" onClick={() => { setShowRecheck(false); setParsedData(null); }} data-testid="button-cancel-recheck">
          Cancel
        </Button>
      )}
    </div>
  );
}

function DbsTab({ candidateId }: { candidateId: string }) {
  const { data: verification, isLoading } = useQuery<(DbsVerification & { sourceDocumentId?: string | null }) | null>({
    queryKey: ["/api/candidates", candidateId, "dbs-verification"],
  });
  const { data: candidate } = useQuery<Candidate>({
    queryKey: ["/api/candidates", candidateId],
  });
  const { data: dbsStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/dbs/status"],
  });
  const { data: allDocs } = useQuery<Document[]>({
    queryKey: [`/api/candidates/${candidateId}/documents`],
  });
  const dbsDocs = (allDocs || [])
    .filter((d) => d.category === "dbs")
    .sort((a, b) => new Date(b.uploadedAt as any).getTime() - new Date(a.uploadedAt as any).getTime());
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const selectedDoc = selectedDocId
    ? dbsDocs.find((d) => d.id === selectedDocId)
    : dbsDocs[0];
  const verificationSourceDoc = verification?.sourceDocumentId
    ? (allDocs || []).find((d) => d.id === verification.sourceDocumentId)
    : undefined;

  const [certNum, setCertNum] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [certType, setCertType] = useState("Enhanced with Barred List");
  const [updateService, setUpdateService] = useState(false);
  const [surname, setSurname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [liveResult, setLiveResult] = useState<any>(null);
  const { toast } = useToast();

  const prefillFromDoc = useCallback((doc: Document | undefined) => {
    if (!doc) return;
    setSelectedDocId(doc.id);
    const fields = (doc.aiExtractedFields as Record<string, string | null> | undefined) || {};
    // Always overwrite (including clearing) so switching between docs
    // with partial extraction doesn't leave stale values from a
    // previously selected upload.
    setCertNum(fields.certificateNumber ? String(fields.certificateNumber) : "");
    let isoIssueDate = "";
    if (fields.issueDate) {
      // Accept either ISO (YYYY-MM-DD) or DD/MM/YYYY style; normalise to ISO for the date input.
      const raw = String(fields.issueDate).trim();
      isoIssueDate = /^\d{4}-\d{2}-\d{2}/.test(raw)
        ? raw.slice(0, 10)
        : (() => {
            const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
            if (!m) return "";
            const [, d, mo, y] = m;
            const yyyy = y.length === 2 ? `20${y}` : y;
            return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
          })();
    }
    setIssueDate(isoIssueDate);
    const t = (fields.certificateType || "").toString().toLowerCase();
    if (t.includes("enhanced") && t.includes("barred")) setCertType("Enhanced with Barred List");
    else if (t.includes("enhanced")) setCertType("Enhanced");
    else if (t.includes("standard")) setCertType("Standard");
    else setCertType("Enhanced with Barred List");
    toast({ title: "Form pre-filled", description: "Confirm or correct the values, then save." });
  }, [toast]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/dbs-verification`, {
        certificateNumber: certNum,
        issueDate,
        certificateType: certType,
        updateServiceSubscribed: updateService,
        checkResult: "No new information",
        status: "verified",
        verifiedAt: new Date().toISOString(),
        sourceDocumentId: selectedDocId || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "dbs-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({ title: "DBS Verified", description: "DBS verification completed successfully." });
    },
  });

  const liveCheckMutation = useMutation({
    mutationFn: async (data: { certificateNumber: string; surname: string; dateOfBirth: string }) => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/dbs-live-check`, data);
      return res.json();
    },
    onSuccess: (data) => {
      setLiveResult(data.liveCheckResult);
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "dbs-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      if (data.liveCheckResult?.isCurrent && data.liveCheckResult?.isClear) {
        toast({ title: "DBS Clear", description: "No new information found — certificate is current and clear." });
      } else if (data.liveCheckResult?.isCurrent) {
        toast({ title: "DBS Current", description: "Certificate is current but has existing information. Review recommended.", variant: "destructive" });
      } else {
        toast({ title: "DBS Alert", description: "New information available — manual review required.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "DBS Check Failed", description: err.message || "Could not reach the DBS Update Service.", variant: "destructive" });
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  if (verification) {
    return (
      <div className="space-y-4" data-testid="tab-dbs">
        <VerificationBanner
          status={verification.status}
          type="DBS"
          verifiedAt={verification.verifiedAt}
          candidateId={candidateId}
        />
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Certificate Number" value={verification.certificateNumber} />
          <InfoRow label="Issue Date" value={verification.issueDate} />
          <InfoRow label="Certificate Type" value={verification.certificateType} />
          <InfoRow label="Update Service" value={verification.updateServiceSubscribed ? "Subscribed" : "Not subscribed"} />
          <InfoRow label="Check Result" value={verification.checkResult} />
        </div>
        {verificationSourceDoc && verificationSourceDoc.filePath && (
          <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 p-3 text-xs text-muted-foreground flex items-center gap-2" data-testid="dbs-verified-source-doc">
            <FileCheck className="h-4 w-4 text-emerald-400" />
            <span>Verified from</span>
            <a
              href={verificationSourceDoc.filePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
              data-testid="link-dbs-source-doc"
            >
              <ExternalLink className="h-3 w-3" />
              {verificationSourceDoc.originalFilename || verificationSourceDoc.filename}
            </a>
          </div>
        )}
        {verification.updateServiceSubscribed && dbsStatus?.configured && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">Re-check via DBS Update Service</p>
              <p className="text-xs text-muted-foreground">
                Run a live check against the DBS Update Service to confirm the certificate remains current and clear.
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-lg">
                <div className="space-y-2">
                  <Label>Surname</Label>
                  <Input value={surname || candidate?.fullName?.split(" ").pop() || ""} onChange={e => setSurname(e.target.value)} placeholder="As on DBS certificate" data-testid="input-recheck-surname" />
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} data-testid="input-recheck-dob" />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => liveCheckMutation.mutate({
                  certificateNumber: verification.certificateNumber,
                  surname: surname || candidate?.fullName?.split(" ").pop() || "",
                  dateOfBirth,
                })}
                disabled={!(surname || candidate?.fullName) || !dateOfBirth || liveCheckMutation.isPending}
                data-testid="button-recheck-dbs"
                tooltip="Run a live re-check against the DBS Update Service to confirm the certificate is still current."
              >
                <Shield className="h-4 w-4 mr-2" />
                {liveCheckMutation.isPending ? "Checking..." : "Run Live DBS Check"}
              </Button>
              {liveResult && (
                <div className="rounded-md border p-4 space-y-2 bg-card">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${liveResult.isCurrent && liveResult.isClear ? "bg-green-500" : "bg-amber-500"}`} />
                    <span className="text-sm font-medium">
                      {liveResult.isCurrent && liveResult.isClear ? "Current & Clear" : liveResult.isCurrent ? "Current — Review Needed" : "New Information — Escalate"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
                    <span>API Status: {liveResult.status}</span>
                    <span>Print Date: {liveResult.printDate || "—"}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const DBS_URL = "https://www.gov.uk/request-copy-criminal-record";
  const DBS_UPDATE_URL = "https://www.gov.uk/dbs-update-service";

  return (
    <div className="space-y-4" data-testid="tab-dbs">
      {dbsDocs.length > 0 && (
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-3" data-testid="dbs-uploaded-files-panel">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Uploaded DBS certificate{dbsDocs.length > 1 ? "s" : ""}</p>
            <span className="text-[11px] text-muted-foreground">{dbsDocs.length} on file</span>
          </div>
          {dbsDocs.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Verifying against</Label>
              <Select value={selectedDoc?.id || ""} onValueChange={(v) => setSelectedDocId(v)}>
                <SelectTrigger data-testid="select-dbs-source-doc">
                  <SelectValue placeholder="Pick an uploaded file" />
                </SelectTrigger>
                <SelectContent>
                  {dbsDocs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {(d.originalFilename || d.filename)} — uploaded {new Date(d.uploadedAt as any).toLocaleDateString("en-GB")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {selectedDoc && (
            <div className="rounded-md border border-emerald-900/30 bg-background/60 p-3 space-y-2" data-testid={`dbs-doc-card-${selectedDoc.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="truncate font-medium">{selectedDoc.originalFilename || selectedDoc.filename}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Uploaded {new Date(selectedDoc.uploadedAt as any).toLocaleString("en-GB")}
                  </div>
                  {(() => {
                    const f = (selectedDoc.aiExtractedFields as Record<string, string | null> | undefined) || {};
                    const hasAny = f.certificateNumber || f.issueDate || f.certificateType;
                    if (!hasAny) {
                      return (
                        <div className="text-[11px] text-amber-400/80">
                          No fields auto-extracted — fill the form manually below.
                        </div>
                      );
                    }
                    return (
                      <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1">
                        {f.certificateNumber && <div>AI cert no.: <span className="font-mono text-foreground/80">{f.certificateNumber}</span></div>}
                        {f.issueDate && <div>AI issue date: <span className="text-foreground/80">{f.issueDate}</span></div>}
                        {f.certificateType && <div>AI cert type: <span className="text-foreground/80">{f.certificateType}</span></div>}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {selectedDoc.filePath && (
                    <Button asChild variant="outline" size="sm" data-testid={`button-open-dbs-doc-${selectedDoc.id}`}>
                      <a href={selectedDoc.filePath} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Open
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => prefillFromDoc(selectedDoc)}
                    data-testid={`button-verify-from-upload-${selectedDoc.id}`}
                    tooltip="Pre-fill the form below using the AI-extracted fields from this upload."
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Verify this certificate
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 p-4 space-y-3">
        <p className="text-sm font-medium">DBS Certificate Verification</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">1</span>
            Obtain the candidate's DBS certificate number (12 digits, found top-right of the certificate)
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">2</span>
            If subscribed to the Update Service, check the certificate status online
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">3</span>
            Enter the certificate details below and record the verification
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(DBS_UPDATE_URL, "_blank")}
            data-testid="button-open-dbs-update"
            tooltip="Open the DBS Update Service in a new tab to check the certificate online."
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            DBS Update Service
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(DBS_URL, "_blank")}
            data-testid="button-open-dbs-info"
            tooltip="Open the gov.uk DBS certificate guidance in a new tab."
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            DBS Certificate Info
          </Button>
        </div>
      </div>

      <div className="space-y-3 max-w-lg">
        <div className="space-y-2">
          <Label>Certificate Number</Label>
          <Input value={certNum} onChange={e => setCertNum(e.target.value)} placeholder="e.g. 001234567890" data-testid="input-dbs-number" />
        </div>
        <div className="space-y-2">
          <Label>Issue Date</Label>
          <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} data-testid="input-dbs-date" />
        </div>
        <div className="space-y-2">
          <Label>Certificate Type</Label>
          <Select value={certType} onValueChange={setCertType}>
            <SelectTrigger data-testid="select-dbs-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Enhanced with Barred List">Enhanced with Barred List</SelectItem>
              <SelectItem value="Enhanced">Enhanced</SelectItem>
              <SelectItem value="Standard">Standard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={updateService} onCheckedChange={setUpdateService} data-testid="switch-update-service" />
          <Label className="text-sm">DBS Update Service subscribed</Label>
        </div>
        {updateService && dbsStatus?.configured && (
          <>
            <Separator />
            <p className="text-sm font-medium">Live DBS Update Service Check</p>
            <p className="text-xs text-muted-foreground">
              Provide the candidate's surname and date of birth to verify the certificate directly with the DBS Update Service.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Surname</Label>
                <Input value={surname || candidate?.fullName?.split(" ").pop() || ""} onChange={e => setSurname(e.target.value)} placeholder="As on DBS certificate" data-testid="input-live-surname" />
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} data-testid="input-live-dob" />
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <Button onClick={() => verifyMutation.mutate()} disabled={!certNum || verifyMutation.isPending} data-testid="button-verify-dbs" tooltip="Save these DBS certificate details against the candidate's record.">
            {verifyMutation.isPending ? "Verifying..." : "Record DBS Verification"}
          </Button>
          {updateService && dbsStatus?.configured && (
            <Button
              variant="outline"
              onClick={() => liveCheckMutation.mutate({
                certificateNumber: certNum,
                surname: surname || candidate?.fullName?.split(" ").pop() || "",
                dateOfBirth,
              })}
              disabled={!certNum || !(surname || candidate?.fullName) || !dateOfBirth || liveCheckMutation.isPending}
              data-testid="button-live-dbs-check"
              tooltip="Run a live check against the DBS Update Service to confirm certificate status."
            >
              <Shield className="h-4 w-4 mr-2" />
              {liveCheckMutation.isPending ? "Checking..." : "Live DBS Check"}
            </Button>
          )}
        </div>
        {liveResult && (
          <div className="rounded-md border p-4 space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${liveResult.isCurrent && liveResult.isClear ? "bg-green-500" : "bg-amber-500"}`} />
              <span className="text-sm font-medium">
                {liveResult.isCurrent && liveResult.isClear ? "Current & Clear" : liveResult.isCurrent ? "Current — Review Needed" : "New Information — Escalate"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
              <span>API Status: {liveResult.status}</span>
              <span>Print Date: {liveResult.printDate || "—"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RightToWorkTab({ candidateId, candidateName }: { candidateId: string; candidateName?: string }) {
  const { data: docs, isLoading } = useQuery<any[]>({
    queryKey: [`/api/candidates/${candidateId}/documents`],
  });
  const [docType, setDocType] = useState("Passport");
  const [expiryDate, setExpiryDate] = useState("");
  const [poaDocDate, setPoaDocDate] = useState("");
  const { toast } = useToast();
  const rtwFileRef = useRef<HTMLInputElement>(null);
  const poaFileRef = useRef<HTMLInputElement>(null);

  const rtwUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", docType);
      formData.append("category", "right_to_work");
      if (expiryDate) formData.append("expiryDate", expiryDate);
      const res = await fetch(`/api/candidates/${candidateId}/document-upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}/documents`] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      setExpiryDate("");
      toast({ title: "Document uploaded" });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const poaUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!poaDocDate) throw new Error("Please select the document date first");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentDate", poaDocDate);
      const res = await fetch(`/api/candidates/${candidateId}/proof-of-address`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}/documents`] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      setPoaDocDate("");
      toast({ title: "Proof of address uploaded" });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const { deleteDoc: deleteDocMutation, confirmName: confirmNameMutation } = useDocumentMutations(candidateId);

  const handleRtwFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) rtwUploadMutation.mutate(file);
    if (e.target) e.target.value = "";
  };

  const handlePoaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) poaUploadMutation.mutate(file);
    if (e.target) e.target.value = "";
  };

  if (isLoading) return <Skeleton className="h-40" />;

  const rtwDocs = (docs || []).filter((d: any) => d.category === "right_to_work");
  const poaDocs = (docs || []).filter((d: any) => d.category === "proof_of_address");

  const getPoaState = (expiryDate: string | null) => getProofOfAddressValidity(expiryDate);

  return (
    <div className="space-y-6" data-testid="tab-right-to-work">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Photo ID / Right to Work</h4>
        {rtwDocs.length > 0 && (
          <div className="space-y-2">
            {rtwDocs.map((doc: any) => {
              const isImage = doc.mimeType?.startsWith("image/") && !!doc.filePath;
              return (
              <div key={doc.id} className="rounded-lg border border-card-border" data-testid={`doc-rtw-${doc.id}`}>
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {isImage ? (
                      <a
                        href={doc.filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        data-testid={`thumb-rtw-${doc.id}`}
                      >
                        <img
                          src={doc.filePath}
                          alt={doc.type}
                          className="h-14 w-14 rounded object-cover border border-border"
                        />
                      </a>
                    ) : (
                      <FileCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{doc.type}</p>
                      {doc.type === "Share Code Screenshot" && doc.notes && (
                        <p className="text-xs font-mono text-foreground/80" data-testid={`text-rtw-share-code-${doc.id}`}>
                          Share code: <span className="font-semibold tracking-wider">{doc.notes}</span>
                        </p>
                      )}
                      {doc.filePath ? (
                        <DocumentLink doc={doc} />
                      ) : (
                        <p className="text-xs text-muted-foreground">{doc.filename}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.type === "Share Code Screenshot" && (
                      <Badge variant="secondary" className="text-xs">Share code</Badge>
                    )}
                    {doc.uploadedBy === "nurse" && <PortalBadge />}
                    {doc.expiryDate && (
                      <Badge variant="outline" className="text-xs">Expires: {doc.expiryDate}</Badge>
                    )}
                    <DocumentAiIndicator status={doc.aiStatus} />
                    {doc.filePath && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild tooltip="Open this document in a new tab.">
                        <a href={doc.filePath} target="_blank" rel="noopener noreferrer" data-testid={`button-view-rtw-${doc.id}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <DocumentDeleteButton
                      docId={doc.id}
                      filename={doc.originalFilename || doc.filename}
                      candidateName={candidateName}
                      onDelete={(id) => deleteDocMutation.mutate(id)}
                      isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                    />
                  </div>
                </div>
                <DocumentAiIssues
                  issues={doc.aiIssues}
                  status={doc.aiStatus}
                  documentId={doc.id}
                  filename={doc.originalFilename || doc.filename}
                  candidateName={candidateName}
                  onConfirmNameMatch={(id) => confirmNameMutation.mutate(id)}
                  isConfirming={confirmNameMutation.isPending && confirmNameMutation.variables === doc.id}
                  onDeleteDocument={(id) => deleteDocMutation.mutate(id)}
                  isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                />
              </div>
              );
            })}
          </div>
        )}

        <Card className="border border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Upload Photo ID / Right to Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger data-testid="select-rtw-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Passport">UK/EU Passport</SelectItem>
                  <SelectItem value="BRP">Biometric Residence Permit (BRP)</SelectItem>
                  <SelectItem value="Visa">Visa</SelectItem>
                  <SelectItem value="EU Settlement">EU Settlement Scheme</SelectItem>
                  <SelectItem value="Birth Certificate">Birth Certificate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expiry Date (if applicable)</Label>
              <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} data-testid="input-rtw-expiry" />
            </div>
            <Button
              onClick={() => rtwFileRef.current?.click()}
              disabled={rtwUploadMutation.isPending}
              className="gap-1.5"
              data-testid="button-upload-rtw"
              tooltip="Upload a new photo ID or right-to-work document for this candidate."
            >
              {rtwUploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {rtwUploadMutation.isPending ? "Uploading..." : "Choose File & Upload"}
            </Button>
            <input ref={rtwFileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleRtwFile} />
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Proof of Address</h4>
        <p className="text-xs text-muted-foreground">Utility bill, bank statement, or council tax bill dated within the last 3 months</p>

        {poaDocs.length > 0 && (
          <div className="space-y-2">
            {poaDocs.map((doc: any) => {
              const poaState = getPoaState(doc.expiryDate);
              const expired = poaState === "expired";
              const unknown = poaState === "unknown";
              const borderClass = unknown
                ? "border-amber-500/30 bg-amber-500/5"
                : expired
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-emerald-500/30 bg-emerald-500/5";
              const isImage = doc.mimeType?.startsWith("image/");
              return (
                <div key={doc.id} className={`rounded-lg border ${borderClass}`} data-testid={`doc-poa-${doc.id}`}>
                  <div className="flex items-center gap-3 p-3">
                    {isImage && doc.filePath ? (
                      <img src={doc.filePath} alt="Proof of address" className="h-12 w-12 rounded object-cover border border-border shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {doc.filePath ? (
                        <a
                          href={doc.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate text-primary hover:underline block"
                          data-testid={`link-poa-name-${doc.id}`}
                        >
                          {doc.originalFilename || doc.filename}
                        </a>
                      ) : (
                        <p className="text-sm font-medium truncate">{doc.originalFilename || doc.filename}</p>
                      )}
                      {doc.expiryDate ? (
                        <span className={`text-[10px] ${expired ? "text-red-500" : "text-emerald-600"}`}>
                          Dated: {new Date(doc.expiryDate).toLocaleDateString("en-GB")}
                          {expired && " — Older than 3 months"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600">Date unknown</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <DocumentAiIndicator status={doc.aiStatus} />
                      {doc.filePath && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild tooltip="Open this proof-of-address document in a new tab.">
                          <a href={doc.filePath} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /></a>
                        </Button>
                      )}
                      <DocumentDeleteButton
                        docId={doc.id}
                        filename={doc.originalFilename || doc.filename}
                        candidateName={candidateName}
                        onDelete={(id) => deleteDocMutation.mutate(id)}
                        isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                      />
                    </div>
                  </div>
                  <DocumentAiIssues
                    issues={doc.aiIssues}
                    status={doc.aiStatus}
                    documentId={doc.id}
                    filename={doc.originalFilename || doc.filename}
                    candidateName={candidateName}
                    onConfirmNameMatch={(id) => confirmNameMutation.mutate(id)}
                    isConfirming={confirmNameMutation.isPending && confirmNameMutation.variables === doc.id}
                    onDeleteDocument={(id) => deleteDocMutation.mutate(id)}
                    isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                  />
                </div>
              );
            })}
          </div>
        )}

        <Card className="border border-card-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Document Date</Label>
                <Input
                  type="date"
                  value={poaDocDate}
                  onChange={(e) => setPoaDocDate(e.target.value)}
                  className="h-8 text-xs"
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => poaFileRef.current?.click()}
                disabled={!poaDocDate || poaUploadMutation.isPending}
                tooltip="Upload a proof-of-address document dated within the last 3 months."
              >
                {poaUploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Upload Proof
              </Button>
            </div>
          </CardContent>
        </Card>
        <input ref={poaFileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handlePoaFile} />
      </div>
    </div>
  );
}

function AdminEmploymentHistory({ candidateId }: { candidateId: string }) {
  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/candidates", candidateId, "employment-history"],
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (entries.length === 0) return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Work History</h3>
      <p className="text-sm text-muted-foreground">No employment history recorded yet.</p>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="admin-employment-history">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Work History</h3>
        <Badge variant="outline" className="text-xs">{entries.length} {entries.length === 1 ? "entry" : "entries"}</Badge>
      </div>
      <div className="space-y-2">
        {entries.map((entry: any) => (
          <div key={entry.id} className="rounded-lg border border-card-border p-3" data-testid={`admin-employment-${entry.id}`}>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{entry.jobTitle}</p>
                <p className="text-sm text-muted-foreground">{entry.employer}{entry.department ? ` — ${entry.department}` : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.startDate} — {entry.isCurrent ? "Present" : entry.endDate || "N/A"}
                  {entry.reasonForLeaving && <span className="ml-2">• Left: {entry.reasonForLeaving}</span>}
                </p>
                {entry.duties && <p className="text-xs text-muted-foreground mt-1">{entry.duties}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminEducationHistory({ candidateId }: { candidateId: string }) {
  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/candidates", candidateId, "education-history"],
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (entries.length === 0) return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Education & Qualifications</h3>
      <p className="text-sm text-muted-foreground">No education history recorded yet.</p>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="admin-education-history">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Education & Qualifications</h3>
        <Badge variant="outline" className="text-xs">{entries.length} {entries.length === 1 ? "entry" : "entries"}</Badge>
      </div>
      <div className="space-y-2">
        {entries.map((entry: any) => (
          <div key={entry.id} className="rounded-lg border border-card-border p-3" data-testid={`admin-education-${entry.id}`}>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{entry.qualification}{entry.subject ? ` — ${entry.subject}` : ""}</p>
                <p className="text-sm text-muted-foreground">{entry.institution}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.startDate || "N/A"} — {entry.endDate || "Present"}
                  {entry.grade && <span className="ml-2">• Grade: {entry.grade}</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileTab({ candidate, candidateId }: { candidate: Candidate; candidateId: string }) {
  const [cv, setCv] = useState("");
  const [employer, setEmployer] = useState(candidate.currentEmployer || "");
  const [yearsQualified, setYearsQualified] = useState(candidate.yearsQualified?.toString() || "");
  const [specialisms, setSpecialisms] = useState<string[]>(candidate.specialisms || []);
  const [unlockedProfileFields, setUnlockedProfileFields] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const isProfileLocked = (field: string, originalValue: string | null | undefined) => {
    const val = originalValue ?? "";
    return val !== "" && !unlockedProfileFields.has(field);
  };
  const unlockProfileField = (field: string) => {
    setUnlockedProfileFields(prev => new Set(prev).add(field));
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/candidates/${candidateId}`, {
        currentEmployer: employer,
        yearsQualified: yearsQualified ? parseInt(yearsQualified) : null,
        specialisms,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      setUnlockedProfileFields(new Set());
      toast({ title: "Profile updated" });
    },
  });

  return (
    <div className="space-y-6" data-testid="tab-profile">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Employment Details</h3>
          <div className="space-y-3">
            <LockedInput label="Current Employer" value={employer} onChange={v => setEmployer(v)} locked={isProfileLocked("employer", candidate.currentEmployer)} onUnlock={() => unlockProfileField("employer")} placeholder="e.g. Royal Marsden NHS Trust" testId="input-employer" />
            <LockedInput label="Years Qualified" value={yearsQualified} onChange={v => setYearsQualified(v)} locked={isProfileLocked("yearsQualified", candidate.yearsQualified?.toString())} onUnlock={() => unlockProfileField("yearsQualified")} type="number" min="0" placeholder="e.g. 5" testId="input-years-qualified" />
            <div className="space-y-2">
              <Label>Clinical Specialisms</Label>
              <SpecialismSelector selected={specialisms} onChange={setSpecialisms} testIdPrefix="admin-specialism" />
            </div>
            <div className="space-y-2">
              <Label>Band</Label>
              <Input value={candidate.band?.toString() || ""} disabled className="bg-muted" />
            </div>
          </div>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-update-profile" tooltip="Save changes to this candidate's employment, specialisms and band.">
            {updateMutation.isPending ? "Saving..." : "Update Profile"}
          </Button>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Summary</h3>
          <div className="rounded-lg border border-card-border p-4 space-y-3">
            <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Current/Most Recent Employer" value={candidate.currentEmployer} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Years Qualified" value={candidate.yearsQualified?.toString()} />
            <InfoRow icon={<Award className="h-4 w-4" />} label="Band" value={candidate.band ? `Band ${candidate.band}` : undefined} />
            <InfoRow icon={<Stethoscope className="h-4 w-4" />} label="Specialisms" value={candidate.specialisms?.join(", ")} />
          </div>
        </div>
      </div>

      <Separator />

      <AdminEmploymentHistory candidateId={candidateId} />

      <Separator />

      <AdminEducationHistory candidateId={candidateId} />
    </div>
  );
}

function CompetencyTab({ candidateId }: { candidateId: string }) {
  const { data: declarations, isLoading } = useQuery<CompetencyDeclaration[]>({
    queryKey: ["/api/candidates", candidateId, "competency-declarations"],
  });
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async ({ comp, level }: { comp: typeof COMPETENCY_MATRIX[number]; level: string }) => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/competency-declarations`, {
        domain: comp.domain,
        competencyName: comp.competency,
        mandatory: comp.mandatory,
        selfAssessedLevel: level,
        minimumRequiredLevel: comp.minimumLevel,
        gapIdentified: false,
        status: "declared",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "competency-declarations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({ title: "Competency declaration recorded" });
    },
  });

  if (isLoading) return <Skeleton className="h-60" />;

  const declaredNames = new Set((declarations || []).map(d => d.competencyName));
  const domains = Array.from(new Set(COMPETENCY_MATRIX.map(c => c.domain)));

  const levelLabels: Record<string, string> = {
    not_declared: "Not Declared",
    level_1: "L1 - Theory",
    level_2: "L2 - Supervised",
    level_3: "L3 - Competent",
    level_4: "L4 - Expert",
  };

  return (
    <div className="space-y-6" data-testid="tab-competency">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {declarations?.length || 0} of {COMPETENCY_MATRIX.filter(c => c.mandatory).length} mandatory competencies declared
          </p>
        </div>
      </div>

      <details className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/30 dark:bg-blue-950/20">
        <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-xs font-medium text-blue-300 hover:text-blue-200">
          <Award className="h-3.5 w-3.5 shrink-0" />
          Level guide
        </summary>
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/30 p-2.5 space-y-0.5">
            <p className="text-xs font-semibold text-foreground">L1 — Theory</p>
            <p className="text-[11px] text-muted-foreground">Understands theory, not yet performed on a patient. e.g. newly qualified nurse who studied wound care at uni but hasn't dressed a complex wound independently.</p>
          </div>
          <div className="rounded-md bg-muted/30 p-2.5 space-y-0.5">
            <p className="text-xs font-semibold text-foreground">L2 — Supervised</p>
            <p className="text-[11px] text-muted-foreground">Has performed under direct supervision. e.g. a nurse who has given IV medication a few times with a mentor guiding them through.</p>
          </div>
          <div className="rounded-md bg-muted/30 p-2.5 space-y-0.5">
            <p className="text-xs font-semibold text-foreground">L3 — Competent</p>
            <p className="text-[11px] text-muted-foreground">Performs independently without supervision. e.g. a band 5 with 2 years' experience who routinely manages IV lines, catheterisations, and clinical obs.</p>
          </div>
          <div className="rounded-md bg-muted/30 p-2.5 space-y-0.5">
            <p className="text-xs font-semibold text-foreground">L4 — Expert</p>
            <p className="text-[11px] text-muted-foreground">Performs to a high standard and can teach others. e.g. a senior sister or clinical educator who mentors juniors and leads on complex cases.</p>
          </div>
        </div>
      </details>

      {domains.map(domain => {
        const comps = COMPETENCY_MATRIX.filter(c => c.domain === domain);
        return (
          <div key={domain} className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">{domain}</h4>
            <div className="rounded-lg border border-card-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Competency</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Required</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Min Level</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-36">Self-Declared Level</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map(comp => {
                    const declaration = (declarations || []).find(d => d.competencyName === comp.competency);
                    const levelOrder = ["level_1", "level_2", "level_3", "level_4"];
                    const hasGap = declaration && levelOrder.indexOf(declaration.selfAssessedLevel) < levelOrder.indexOf(comp.minimumLevel);
                    return (
                      <tr key={comp.competency} className="border-t border-card-border">
                        <td className="px-3 py-2 text-foreground">{comp.competency}</td>
                        <td className="px-3 py-2 text-center">
                          {comp.mandatory ? (
                            <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/50">Required</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Optional</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-xs">{levelLabels[comp.minimumLevel]}</td>
                        <td className="px-3 py-2 text-center">
                          {declaration ? (
                            <Badge variant="outline" className={`text-[10px] ${hasGap ? "bg-orange-950/60 text-orange-300 border-orange-800/50" : "bg-emerald-950/60 text-emerald-300 border-emerald-800/50"}`}>
                              {levelLabels[declaration.selfAssessedLevel]}
                            </Badge>
                          ) : (
                            <Select
                              onValueChange={(level) => addMutation.mutate({ comp, level })}
                            >
                              <SelectTrigger className="h-7 text-xs w-36" data-testid={`select-comp-${comp.competency.slice(0, 20)}`}>
                                <SelectValue placeholder="Select level" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="level_1">L1 - Theory</SelectItem>
                                <SelectItem value="level_2">L2 - Supervised</SelectItem>
                                <SelectItem value="level_3">L3 - Competent</SelectItem>
                                <SelectItem value="level_4">L4 - Expert</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {declaration && hasGap ? (
                            <AlertTriangle className="h-4 w-4 text-orange-400 mx-auto" />
                          ) : declaration ? (
                            <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" />
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrainingTab({ candidateId, candidateName }: { candidateId: string; candidateName?: string }) {
  const { data: training, isLoading } = useQuery<MandatoryTraining[]>({
    queryKey: ["/api/candidates", candidateId, "mandatory-training"],
  });
  const { data: docs } = useQuery<any[]>({
    queryKey: [`/api/candidates/${candidateId}/documents`],
  });
  const { deleteDoc: deleteDocMutation, confirmName: confirmNameMutation } = useDocumentMutations(candidateId);
  const { toast } = useToast();
  const [certUploading, setCertUploading] = useState(false);
  const [lastUploadResult, setLastUploadResult] = useState<{ autoRecorded: string[]; totalModulesMatched: number } | null>(null);

  const addMutation = useMutation({
    mutationFn: async (mod: { name: string; renewalFrequency: string }) => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/mandatory-training`, {
        moduleName: mod.name,
        renewalFrequency: mod.renewalFrequency,
        completedDate: new Date().toISOString().split("T")[0],
        expiryDate: mod.renewalFrequency === "Annual"
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          : new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        issuingBody: "Skills for Health",
        certificateUploaded: true,
        status: "completed",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "mandatory-training"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({ title: "Training recorded" });
    },
  });

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertUploading(true);
    setLastUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/candidates/${candidateId}/training-cert-upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const result = await res.json();
      setLastUploadResult({ autoRecorded: result.autoRecorded, totalModulesMatched: result.totalModulesMatched });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "mandatory-training"] });
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}/documents`] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({
        title: "Certificate processed",
        description: `${result.autoRecorded.length} module(s) auto-recorded from ${result.totalModulesMatched} match(es)`,
      });
    } catch {
      toast({ title: "Upload failed", description: "Could not process training certificate", variant: "destructive" });
    } finally {
      setCertUploading(false);
      e.target.value = "";
    }
  };

  if (isLoading) return <Skeleton className="h-60" />;

  const trainingCerts = (docs || []).filter((d: any) => d.category === "training_certificate");

  return (
    <div className="space-y-4" data-testid="tab-training">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {training?.length || 0} of {MANDATORY_TRAINING_MODULES.length} modules completed
        </p>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".pdf" className="hidden" onChange={handleCertUpload} disabled={certUploading} data-testid="input-training-cert-upload" />
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild disabled={certUploading} tooltip="Upload a training certificate PDF — modules will be auto-detected and recorded.">
              <span>
                {certUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload Certificate PDF
              </span>
            </Button>
          </label>
        </div>
      </div>

      {lastUploadResult && (
        <div className="rounded-md border border-emerald-800/50 bg-emerald-950/30 p-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-emerald-300">Certificate Processed</p>
              <p className="text-muted-foreground mt-1">
                {lastUploadResult.totalModulesMatched} module(s) detected, {lastUploadResult.autoRecorded.length} auto-recorded:
              </p>
              {lastUploadResult.autoRecorded.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs text-emerald-300/80">
                  {lastUploadResult.autoRecorded.map(m => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-card-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Module</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Renewal</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-28">Status</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">Certificate</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-28">Expiry</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Action</th>
            </tr>
          </thead>
          <tbody>
            {MANDATORY_TRAINING_MODULES.map(mod => {
              const record = (training || []).find(t => t.moduleName === mod.name);
              const cert = trainingCerts.find((d: any) => d.type === mod.name || d.type === "Training Certificate Bundle");
              return (
                <tr key={mod.name} className="border-t border-card-border">
                  <td className="px-3 py-2 text-foreground">{mod.name}</td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{mod.renewalFrequency}</td>
                  <td className="px-3 py-2 text-center">
                    {record ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
                        <CheckCircle className="h-3 w-3 mr-1" />Completed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Pending</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {cert ? (
                      <div className="flex items-center gap-1">
                        <DocumentLink doc={cert} />
                        {cert.uploadedBy === "nurse" && <PortalBadge />}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No certificate</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{record?.expiryDate || "-"}</td>
                  <td className="px-3 py-2 text-center">
                    {!record && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addMutation.mutate(mod)} disabled={addMutation.isPending} tooltip="Manually record this mandatory training module as completed.">
                        Record
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {trainingCerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Certificate Files</h4>
          {trainingCerts.map((doc: any) => (
            <div key={doc.id} className="rounded-lg border border-card-border" data-testid={`doc-training-${doc.id}`}>
              <div className="flex items-center gap-2 p-3">
                <FileCheck className="h-4 w-4 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.type}</p>
                  <DocumentLink doc={doc} />
                </div>
                {doc.uploadedBy === "nurse" && <PortalBadge />}
                <DocumentAiIndicator status={doc.aiStatus} />
                <DocumentDeleteButton
                  docId={doc.id}
                  filename={doc.originalFilename || doc.filename}
                  candidateName={candidateName}
                  onDelete={(id) => deleteDocMutation.mutate(id)}
                  isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                />
              </div>
              <DocumentAiIssues
                issues={doc.aiIssues}
                status={doc.aiStatus}
                documentId={doc.id}
                filename={doc.originalFilename || doc.filename}
                candidateName={candidateName}
                onConfirmNameMatch={(id) => confirmNameMutation.mutate(id)}
                isConfirming={confirmNameMutation.isPending && confirmNameMutation.variables === doc.id}
                onDeleteDocument={(id) => deleteDocMutation.mutate(id)}
                isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TrainingChaseEntry {
  id: string;
  sentAt: string;
  sentBy: string | null;
  recipientEmail: string;
  subject: string;
  body: string;
  modulesIncluded: string[];
  moduleCount: number;
  conversationId: string | null;
  outlookDeepLink: string | null;
}

interface TrainingChaseHistoryResponse {
  outlookConfigured: boolean;
  totalChased: number;
  history: TrainingChaseEntry[];
}

function TrainingChaseHistorySection({ candidateId }: { candidateId: string }) {
  const { data, isLoading, isError } = useQuery<TrainingChaseHistoryResponse>({
    queryKey: ["/api/admin/candidates", candidateId, "training-chase-history"],
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <Card className="border border-card-border" data-testid="card-training-chase-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Training chase history
          {data && (
            <Badge variant="outline" className="ml-2 text-[10px]" data-testid="badge-chase-count">
              {data.totalChased} sent
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24" />}
        {!isLoading && isError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400" data-testid="chase-history-error">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Failed to load training chase history. Please refresh and try again.</span>
          </div>
        )}
        {!isLoading && !isError && data && data.history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground" data-testid="chase-history-empty">
            <Mail className="h-6 w-6 mb-2 opacity-50" />
            <p className="text-sm">No training chase emails have been sent to this nurse yet.</p>
          </div>
        )}
        {!isLoading && !isError && data && data.history.length > 0 && (
          <div className="space-y-2" data-testid="chase-history-list">
            {data.history.map((entry) => {
              const isOpen = !!expanded[entry.id];
              const sentDate = new Date(entry.sentAt);
              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-card-border overflow-hidden"
                  data-testid={`chase-history-row-${entry.id}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(entry.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/40"
                    data-testid={`chase-history-toggle-${entry.id}`}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">
                          {sentDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {entry.moduleCount} module{entry.moduleCount === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {entry.sentBy || "unknown"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {entry.recipientEmail}
                        </span>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-card-border bg-muted/20" data-testid={`chase-history-detail-${entry.id}`}>
                      <div className="pt-3 space-y-3">
                        {entry.modulesIncluded.length > 0 && (
                          <div>
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Modules chased</p>
                            <div className="flex flex-wrap gap-1">
                              {entry.modulesIncluded.map((m) => (
                                <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
                          <p className="text-sm" data-testid={`chase-subject-${entry.id}`}>{entry.subject}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Body (rendered as recipient saw)</p>
                          {/*
                            Run the stored body markdown through the same
                            shared renderer the chase email uses on send,
                            so this history detail matches what the nurse
                            actually received in their inbox (bold names,
                            real bullet lists — not literal asterisks).
                          */}
                          <div
                            className="text-xs rounded-md border border-card-border max-h-64 overflow-auto"
                            style={{
                              background: "#020121",
                              padding: "14px 18px",
                              fontFamily: "'Be Vietnam Pro','Segoe UI',Arial,sans-serif",
                            }}
                            data-testid={`chase-body-${entry.id}`}
                            dangerouslySetInnerHTML={{ __html: renderEmailMarkdown(entry.body) }}
                          />
                        </div>
                        {entry.outlookDeepLink && data.outlookConfigured && (
                          <div>
                            <a
                              href={entry.outlookDeepLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              data-testid={`chase-outlook-link-${entry.id}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open in mailbox
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrainingComplianceTab({ candidateId }: { candidateId: string }) {
  const { data: training, isLoading } = useQuery<MandatoryTraining[]>({
    queryKey: ["/api/candidates", candidateId, "mandatory-training"],
  });

  if (isLoading) return <Skeleton className="h-60" />;

  const records = training || [];
  const now = new Date();

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return "unknown";
    const expiry = new Date(expiryDate);
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return "expired";
    if (daysUntil <= 30) return "expiring_soon";
    if (daysUntil <= 90) return "approaching";
    return "valid";
  };

  const completedCount = records.length;
  const expiredCount = records.filter(r => getExpiryStatus(r.expiryDate) === "expired").length;
  const expiringSoonCount = records.filter(r => getExpiryStatus(r.expiryDate) === "expiring_soon").length;

  return (
    <div className="space-y-4" data-testid="tab-training-compliance">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span className="text-muted-foreground">{completedCount} completed</span>
        </div>
        {expiredCount > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-red-400">{expiredCount} expired</span>
          </div>
        )}
        {expiringSoonCount > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-amber-400">{expiringSoonCount} expiring within 30 days</span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-card-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Module</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-28">Renewal</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-28">Completed</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-28">Expiry Date</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-32">Status</th>
            </tr>
          </thead>
          <tbody>
            {MANDATORY_TRAINING_MODULES.map(mod => {
              const record = records.find(t => t.moduleName === mod.name);
              const status = record ? getExpiryStatus(record.expiryDate) : "not_completed";
              return (
                <tr key={mod.name} className="border-t border-card-border">
                  <td className="px-3 py-2 text-foreground">{mod.name}</td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{mod.renewalFrequency}</td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                    {record?.completedDate || "-"}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                    {record?.expiryDate || "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {status === "expired" && (
                      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/50">
                        <AlertCircle className="h-3 w-3 mr-1" />Expired
                      </Badge>
                    )}
                    {status === "expiring_soon" && (
                      <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/50">
                        <AlertTriangle className="h-3 w-3 mr-1" />Expiring Soon
                      </Badge>
                    )}
                    {status === "approaching" && (
                      <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/50">
                        <Clock className="h-3 w-3 mr-1" />Approaching
                      </Badge>
                    )}
                    {status === "valid" && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
                        <CheckCircle className="h-3 w-3 mr-1" />Valid
                      </Badge>
                    )}
                    {status === "not_completed" && (
                      <Badge variant="outline" className="text-[10px]">Not Completed</Badge>
                    )}
                    {status === "unknown" && (
                      <Badge variant="outline" className="text-[10px]">No Expiry Set</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HealthTab({ candidateId }: { candidateId: string }) {
  const { data: declaration, isLoading } = useQuery<HealthDeclaration | null>({
    queryKey: ["/api/candidates", candidateId, "health-declaration"],
  });
  const [hepB, setHepB] = useState(false);
  const [mmr, setMmr] = useState(false);
  const [varicella, setVaricella] = useState(false);
  const [tb, setTb] = useState(false);
  const [conditions, setConditions] = useState("");
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/health-declaration`, {
        hepatitisBVaccinated: hepB,
        mmrVaccinated: mmr,
        varicellaVaccinated: varicella,
        tbScreened: tb,
        conditionsAffectingPractice: conditions || null,
        ohReferralRequired: !!conditions,
        completed: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "health-declaration"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({ title: "Health declaration submitted" });
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  if (declaration) {
    return (
      <div className="space-y-4" data-testid="tab-health">
        <div className="flex items-center gap-2">
          <StatusBadge status={declaration.completed ? "cleared" : "verification"} />
          {declaration.ohReferralRequired && (
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">OH Referral Required</Badge>
          )}
        </div>

        {declaration.aiTriageStatus === "flagged" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30 p-3 flex items-start gap-3" data-testid="health-triage-flagged">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-300">Flagged for Review</p>
              {declaration.aiTriageNote && <AIMarkdown content={declaration.aiTriageNote} className="prose-p:text-xs prose-p:text-amber-400/80 prose-li:text-xs prose-li:text-amber-400/80 prose-headings:text-amber-300 prose-strong:text-amber-300" />}
            </div>
          </div>
        )}
        {declaration.aiTriageStatus === "clear" && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/20 p-3 flex items-start gap-3" data-testid="health-triage-clear">
            <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-300">No Concerns Identified</p>
              {declaration.aiTriageNote && <AIMarkdown content={declaration.aiTriageNote} className="prose-p:text-xs prose-p:text-green-400/70 prose-li:text-xs prose-li:text-green-400/70 prose-headings:text-green-300 prose-strong:text-green-300" />}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Hepatitis B" value={declaration.hepatitisBVaccinated ? "Vaccinated" : "Not vaccinated"} />
          <InfoRow label="MMR" value={declaration.mmrVaccinated ? "Vaccinated" : "Not vaccinated"} />
          <InfoRow label="Varicella" value={declaration.varicellaVaccinated ? "Vaccinated" : "Not vaccinated"} />
          <InfoRow label="TB Screening" value={declaration.tbScreened ? "Screened" : "Not screened"} />
        </div>
        {declaration.conditionsAffectingPractice && (
          <div className="rounded-lg border border-orange-800/50 bg-orange-950/30 p-3">
            <p className="text-sm font-medium text-orange-300">Declared Conditions:</p>
            <p className="text-sm text-orange-400 mt-1">{declaration.conditionsAffectingPractice}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg" data-testid="tab-health">
      <p className="text-sm text-muted-foreground">Complete the occupational health declaration.</p>
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Immunisation Status</h4>
        <div className="space-y-2">
          {[
            { label: "Hepatitis B Vaccinated", checked: hepB, onChange: setHepB },
            { label: "MMR Vaccinated", checked: mmr, onChange: setMmr },
            { label: "Varicella Vaccinated", checked: varicella, onChange: setVaricella },
            { label: "TB Screened", checked: tb, onChange: setTb },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <Checkbox checked={item.checked} onCheckedChange={(v) => item.onChange(!!v)} />
              <Label className="text-sm">{item.label}</Label>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Conditions affecting clinical practice</Label>
          <Textarea
            value={conditions}
            onChange={e => setConditions(e.target.value)}
            placeholder="Describe any conditions (leave blank if none)"
            data-testid="input-health-conditions"
          />
        </div>
        <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} data-testid="button-submit-health" tooltip="Save the occupational health declaration to this candidate's record.">
          {submitMutation.isPending ? "Submitting..." : "Submit Declaration"}
        </Button>
      </div>
    </div>
  );
}

function ReferencesTab({ candidateId }: { candidateId: string }) {
  const { data: refs, isLoading } = useQuery<Reference[]>({
    queryKey: ["/api/candidates", candidateId, "references"],
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("");
  const [relationship, setRelationship] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftAiGenerated, setDraftAiGenerated] = useState(false);
  const { toast } = useToast();

  const draftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/references/draft-email`, {
        refereeName: name,
        refereeEmail: email,
        refereeOrg: org,
        refereeRole: role,
        relationshipToCandidate: relationship,
      });
      return res.json();
    },
    onSuccess: (data: { subject: string; body: string; aiGenerated: boolean }) => {
      setDraftSubject(data.subject);
      setDraftBody(data.body);
      setDraftAiGenerated(data.aiGenerated);
      setDraftOpen(true);
    },
    onError: () => {
      toast({ title: "Could not generate draft", description: "Please try again.", variant: "destructive" });
    },
  });

  const remindMutation = useMutation({
    mutationFn: async (referenceId: string) => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/references/${referenceId}/remind`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "references"] });
      toast({
        title: "Reminder sent",
        description: `Reminder email sent to referee (${data?.reminderCount || 1}× sent so far).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not send reminder",
        description: err?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/references`, {
        refereeName: name,
        refereeEmail: email,
        refereeOrg: org,
        refereeRole: role,
        relationshipToCandidate: relationship,
        emailSubject: draftSubject,
        emailBody: draftBody,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "references"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      setName(""); setEmail(""); setOrg(""); setRole(""); setRelationship("");
      setDraftOpen(false);
      setDraftSubject("");
      setDraftBody("");
      toast({
        title: "Reference request created",
        description: data.emailSent ? "Reference questionnaire email sent to referee" : "Reference added (email could not be sent)",
      });
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  const outcomeConfig: Record<string, { label: string; color: string }> = {
    pending: { label: "Pending", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
    sent: { label: "Email Sent", color: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
    received: { label: "Received", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
    flagged: { label: "Flagged", color: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
    escalated: { label: "Escalated", color: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
    expired: { label: "Expired", color: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  };

  return (
    <div className="space-y-6" data-testid="tab-references">
      {(refs || []).length > 0 && (
        <div className="space-y-3">
          {(refs || []).map(ref => (
            <Card key={ref.id} className="border border-card-border" data-testid={`reference-${ref.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{ref.refereeName}</p>
                    <p className="text-xs text-muted-foreground">{ref.refereeRole} at {ref.refereeOrg}</p>
                    <p className="text-xs text-muted-foreground">{ref.refereeEmail}</p>
                    <p className="text-xs text-muted-foreground mt-1">Relationship: {ref.relationshipToCandidate}</p>
                    {ref.emailSentAt && (
                      <p className="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> Email sent {new Date(ref.emailSentAt).toLocaleDateString("en-GB")}
                      </p>
                    )}
                    {(ref.reminderCount || 0) > 0 && ref.emailSentAt && (
                      <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-1" data-testid={`ref-reminder-info-${ref.id}`}>
                        <Send className="h-3 w-3" /> Reminder sent {new Date(ref.emailSentAt).toLocaleDateString("en-GB")} • {ref.reminderCount}×
                      </p>
                    )}
                    {ref.formSubmittedAt && (
                      <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {(ref as any).source === "uploaded" ? "Uploaded" : "Form submitted"}{" "}
                        {new Date(ref.formSubmittedAt).toLocaleDateString("en-GB")}
                      </p>
                    )}
                    {(ref as any).documentFilePath && (
                      <a
                        href={(ref as any).documentFilePath}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary hover:underline mt-0.5 inline-flex items-center gap-1"
                        data-testid={`ref-doc-link-${ref.id}`}
                      >
                        <FileDown className="h-3 w-3" />
                        View {(ref as any).documentOriginalFilename || "attached reference document"}
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant="outline" className={outcomeConfig[ref.outcome]?.color || ""}>
                      {outcomeConfig[ref.outcome]?.label || ref.outcome}
                    </Badge>
                    {!ref.formSubmittedAt && (ref.outcome === "pending" || ref.outcome === "sent" || ref.outcome === "escalated") && ref.refereeEmail && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2.5"
                        onClick={() => remindMutation.mutate(ref.id)}
                        disabled={remindMutation.isPending && remindMutation.variables === ref.id}
                        data-testid={`button-resend-reminder-${ref.id}`}
                        tooltip="Send another reminder email to this referee."
                      >
                        {remindMutation.isPending && remindMutation.variables === ref.id ? (
                          <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Sending...</>
                        ) : (
                          <><Send className="h-3 w-3 mr-1.5" /> Resend reminder</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {ref.redFlagTriggered && (
                  <div className="mt-3 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5" data-testid={`ref-red-flag-${ref.id}`}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Red flag triggered — review required
                  </div>
                )}
                {(ref.ratings != null || ref.freeTextResponses != null || ref.conductFlags != null) && (
                  <div className="mt-3 pt-3 border-t border-card-border space-y-4" data-testid={`ref-answers-${ref.id}`}>
                    {ref.ratings != null && (() => {
                      const ratingsObj = ref.ratings as Record<string, any>;
                      const { competencies, ...otherRatings } = ratingsObj;
                      const ratingLabels: Record<string, string> = {};
                      for (const q of REFERENCE_QUESTIONS) {
                        ratingLabels[q.key] = q.question;
                      }
                      return (
                        <>
                          {Object.keys(otherRatings).length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                <Star className="h-3.5 w-3.5 text-[#C8A96E]" /> Ratings
                              </h4>
                              <div className="space-y-1.5">
                                {Object.entries(otherRatings).map(([key, val]) => (
                                  <div key={key} className="flex items-center justify-between rounded bg-muted/30 px-2.5 py-1.5">
                                    <span className="text-xs text-muted-foreground">{ratingLabels[key] || key.replace(/_/g, " ")}</span>
                                    <div className="flex items-center gap-1 shrink-0 ml-3">
                                      {[1, 2, 3, 4, 5].map(n => (
                                        <div
                                          key={n}
                                          className={`h-2 w-5 rounded-sm ${n <= (val as number) ? "bg-[#C8A96E]" : "bg-muted"}`}
                                        />
                                      ))}
                                      <span className="text-xs font-medium text-foreground ml-1.5 w-6 text-right">{val}/5</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {competencies && Object.keys(competencies).length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                <Shield className="h-3.5 w-3.5 text-[#C8A96E]" /> Competency Assessment ({Object.keys(competencies).length} rated)
                              </h4>
                              <div className="grid grid-cols-2 gap-1">
                                {Object.entries(competencies as Record<string, string>).map(([comp, level]) => (
                                  <div key={comp} className="flex justify-between text-xs py-1 px-2.5 rounded bg-muted/30">
                                    <span className="text-muted-foreground truncate mr-2">{comp}</span>
                                    <span className="text-foreground shrink-0 font-medium">{(level as string).replace(/_/g, " ")}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {ref.freeTextResponses != null && Object.keys(ref.freeTextResponses as object).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-[#C8A96E]" /> Written Responses
                        </h4>
                        <div className="space-y-2.5">
                          {Object.entries(ref.freeTextResponses as Record<string, string>).map(([key, val]) => {
                            const question = REFERENCE_QUESTIONS.find(q => q.key === key);
                            return (
                              <div key={key} className="rounded bg-muted/30 px-2.5 py-2">
                                <p className="text-[11px] text-muted-foreground font-medium mb-0.5">{question?.question || key.replace(/_/g, " ")}</p>
                                <p className="text-xs text-foreground whitespace-pre-wrap">{val}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {ref.conductFlags != null && Object.keys(ref.conductFlags as object).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5 text-[#C8A96E]" /> Conduct & Suitability
                        </h4>
                        <div className="space-y-1.5">
                          {Object.entries(ref.conductFlags as Record<string, boolean>).map(([key, val]) => {
                            const question = REFERENCE_QUESTIONS.find(q => q.key === key);
                            const isConcern = (key === "conduct_concerns" && val) || (key === "reemploy" && !val);
                            return (
                              <div key={key} className={`flex items-center justify-between rounded px-2.5 py-1.5 ${isConcern ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40" : "bg-muted/30"}`}>
                                <span className="text-xs text-muted-foreground">{question?.question || key.replace(/_/g, " ")}</span>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ml-3 ${isConcern ? "border-red-700 text-red-300" : "border-emerald-700 text-emerald-300"}`}>
                                  {val ? "Yes" : "No"}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {ref.sicknessAbsenceBand && (
                      <div className="rounded bg-muted/30 px-2.5 py-2">
                        <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Sickness absence record</p>
                        <p className="text-xs text-foreground font-medium">{ref.sicknessAbsenceBand}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UploadExistingReferenceCard candidateId={candidateId} />

      <Card className="border border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Add Reference Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Referee Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Helen Cartwright" data-testid="input-referee-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="h.cartwright@nhs.uk" data-testid="input-referee-email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Organisation</Label>
              <Input value={org} onChange={e => setOrg(e.target.value)} placeholder="NHS Trust" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Clinical Lead" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Relationship to Candidate</Label>
              <Input value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="Line Manager" />
            </div>
          </div>
          <Button onClick={() => draftMutation.mutate()} disabled={!name || !email || draftMutation.isPending} data-testid="button-draft-reference" tooltip="Generate an AI-drafted reference request email for review before sending.">
            {draftMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Drafting Email...</>
            ) : (
              "Draft Reference Request"
            )}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Review Reference Request Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {draftAiGenerated && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2" data-testid="text-ai-badge">
                <Star className="h-3.5 w-3.5" />
                AI-generated draft — review and edit before sending
              </div>
            )}
            {!draftAiGenerated && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2" data-testid="text-fallback-badge">
                <AlertCircle className="h-3.5 w-3.5" />
                Using standard template (AI drafting unavailable)
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">To</Label>
              <p className="text-sm text-muted-foreground" data-testid="text-draft-to">{name} &lt;{email}&gt;</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Subject</Label>
              <Input
                value={draftSubject}
                onChange={e => setDraftSubject(e.target.value)}
                data-testid="input-draft-subject"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email Body</Label>
              <Textarea
                value={draftBody}
                onChange={e => setDraftBody(e.target.value)}
                rows={14}
                className="font-mono text-xs leading-relaxed"
                data-testid="input-draft-body"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              The referee form link and expiry date will be automatically appended when the email is sent.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDraftOpen(false)} data-testid="button-cancel-draft">
                Cancel
              </Button>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !draftSubject || !draftBody}
                data-testid="button-send-reference"
              >
                {addMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-2" /> Send Reference Request</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UploadExistingReferenceCard({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("");
  const [relationship, setRelationship] = useState("");
  const [uploading, setUploading] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("refereeName", name);
      fd.append("refereeEmail", email);
      if (org) fd.append("refereeOrg", org);
      if (role) fd.append("refereeRole", role);
      if (relationship) fd.append("relationshipToCandidate", relationship);

      const res = await fetch(`/api/candidates/${candidateId}/references/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Upload failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "references"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      const ex = data.extraction;
      let desc: string;
      if (ex && !ex.failed) {
        const refLabel = ex.detectedRefereeName ? `${ex.detectedRefereeName}` : "referee";
        const partsExtracted: string[] = [];
        if (ex.detectedRefereeName || ex.detectedRefereeEmail || ex.detectedRefereeOrg) partsExtracted.push("referee details");
        if (ex.ratingsCount) partsExtracted.push(`${ex.ratingsCount} ratings`);
        if (ex.freeTextCount) partsExtracted.push(`${ex.freeTextCount} written answers`);
        desc = partsExtracted.length
          ? `Picked up ${partsExtracted.join(", ")} for ${refLabel}${ex.redFlagTriggered ? " — RED FLAG" : ""} (confidence: ${ex.confidence})`
          : `Saved — AI couldn't pull structured fields from this letter, please review.`;
      } else {
        desc = "Saved as attachment — AI couldn't read the answers, please review manually.";
      }
      toast({ title: "Reference uploaded", description: desc, variant: ex?.redFlagTriggered ? "destructive" : "default" });
      setName(""); setEmail(""); setOrg(""); setRole(""); setRelationship("");
      setResetKey((k) => k + 1);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="border border-card-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4" /> Upload Existing Reference
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Have a reference letter from a previous employer? Just attach the file — AI will read the
          referee's details and answers straight off the letter. The fields below are optional;
          fill them in only if you want to override what AI detects.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Referee Name <span className="text-muted-foreground/60">(optional)</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="AI will detect from the letter" data-testid="input-upload-ref-name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email <span className="text-muted-foreground/60">(optional)</span></Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="AI will detect if printed" data-testid="input-upload-ref-email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Organisation</Label>
            <Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="NHS Trust" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Clinical Lead" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Relationship to Candidate</Label>
            <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Line Manager" />
          </div>
        </div>
        <div key={resetKey} className="flex items-center gap-3">
          <input
            type="file"
            id={`ref-upload-${candidateId}`}
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            disabled={uploading}
            onClick={() => document.getElementById(`ref-upload-${candidateId}`)?.click()}
            data-testid="button-upload-existing-reference"
            tooltip="Upload an existing reference letter — AI extracts referee details and answers."
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading & reading...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Choose file & upload</>
            )}
          </Button>
          <span className="text-[11px] text-muted-foreground">PDF, JPG, PNG, DOC up to 10MB · AI reads referee details + answers</span>
        </div>
      </CardContent>
    </Card>
  );
}

function InductionTab({ candidateId }: { candidateId: string }) {
  // Task 114: the legacy single-policy checklist was retired in favour
  // of the 21 versioned read-and-acknowledge sections. The
  // InductionProgressPanel renders the full breakdown (status,
  // active-time, longest session, scrolled-to-end, last-read) for
  // admins / super-admins, sourced from the same data the candidate
  // uses on the portal.
  return (
    <div className="space-y-4" data-testid="tab-induction">
      <InductionProgressPanel candidateId={candidateId} />
      <SopComprehensionPanel candidateId={candidateId} />
    </div>
  );
}

function IndemnityTab({ candidateId, candidateName }: { candidateId: string; candidateName?: string }) {
  const { data: indemnity, isLoading } = useQuery<ProfessionalIndemnity | null>({
    queryKey: ["/api/candidates", candidateId, "professional-indemnity"],
  });
  const { data: docs } = useQuery<any[]>({
    queryKey: [`/api/candidates/${candidateId}/documents`],
  });
  const { deleteDoc: deleteDocMutation, confirmName: confirmNameMutation } = useDocumentMutations(candidateId);
  const [provider, setProvider] = useState("");
  const [policyNum, setPolicyNum] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/professional-indemnity`, {
        provider,
        policyNumber: policyNum,
        coverStartDate: startDate,
        coverEndDate: endDate,
        scopeAppropriate: true,
        verified: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "professional-indemnity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({ title: "Indemnity recorded" });
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  if (indemnity) {
    return (
      <div className="space-y-4" data-testid="tab-indemnity">
        <div className="flex items-center gap-2">
          <StatusBadge status={indemnity.verified ? "cleared" : "verification"} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Provider" value={indemnity.provider} />
          <InfoRow label="Policy Number" value={indemnity.policyNumber} />
          <InfoRow label="Cover Start" value={indemnity.coverStartDate} />
          <InfoRow label="Cover End" value={indemnity.coverEndDate} />
          <InfoRow label="Scope Appropriate" value={indemnity.scopeAppropriate ? "Yes" : "No"} />
        </div>
        {(() => {
          const indemnityDocs = (docs || []).filter((d: any) => d.category === "indemnity");
          if (indemnityDocs.length > 0) {
            return (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Certificate</h4>
                {indemnityDocs.map((doc: any) => (
                  <div key={doc.id} className="rounded-lg border border-card-border" data-testid={`doc-indemnity-${doc.id}`}>
                    <div className="flex items-center gap-2 p-3">
                      <FileCheck className="h-4 w-4 text-emerald-500" />
                      <div className="flex-1 min-w-0">
                        <DocumentLink doc={doc} />
                      </div>
                      {doc.uploadedBy === "nurse" && <PortalBadge />}
                      <DocumentAiIndicator status={doc.aiStatus} />
                      <DocumentDeleteButton
                        docId={doc.id}
                        filename={doc.originalFilename || doc.filename}
                        candidateName={candidateName}
                        onDelete={(id) => deleteDocMutation.mutate(id)}
                        isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                      />
                    </div>
                    <DocumentAiIssues
                      issues={doc.aiIssues}
                      status={doc.aiStatus}
                      documentId={doc.id}
                      filename={doc.originalFilename || doc.filename}
                      candidateName={candidateName}
                      onConfirmNameMatch={(id) => confirmNameMutation.mutate(id)}
                      isConfirming={confirmNameMutation.isPending && confirmNameMutation.variables === doc.id}
                      onDeleteDocument={(id) => deleteDocMutation.mutate(id)}
                      isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                    />
                  </div>
                ))}
              </div>
            );
          }
          return null;
        })()}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg" data-testid="tab-indemnity">
      <p className="text-sm text-muted-foreground">Record professional indemnity insurance details.</p>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Input value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. Royal College of Nursing" data-testid="input-indemnity-provider" />
        </div>
        <div className="space-y-2">
          <Label>Policy Number</Label>
          <Input value={policyNum} onChange={e => setPolicyNum(e.target.value)} placeholder="e.g. RCN-2025-12345" data-testid="input-indemnity-policy" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Cover Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cover End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => submitMutation.mutate()} disabled={!provider || submitMutation.isPending} data-testid="button-submit-indemnity" tooltip="Save these professional indemnity insurance details to the candidate's record.">
          {submitMutation.isPending ? "Recording..." : "Record Indemnity"}
        </Button>
      </div>
    </div>
  );
}

function DocumentAiIndicator({ status }: { status?: string | null }) {
  if (!status) return null;
  if (status === "pending") {
    return (
      <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/50" data-testid="badge-ai-pending">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking
      </Badge>
    );
  }
  if (status === "pass") {
    return (
      <Badge variant="outline" className="text-[10px] bg-emerald-950/60 text-emerald-300 border-emerald-800/50" data-testid="badge-ai-pass">
        <CheckCircle className="h-3 w-3 mr-1" /> AI OK
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/50" data-testid="badge-ai-warning">
        <AlertTriangle className="h-3 w-3 mr-1" /> Review
      </Badge>
    );
  }
  if (status === "fail") {
    return (
      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/50" data-testid="badge-ai-fail">
        <AlertCircle className="h-3 w-3 mr-1" /> Issues
      </Badge>
    );
  }
  return null;
}

type AiIssueEntry = string | {
  code?: string;
  message?: string;
  nameOnDocument?: string;
  nurseName?: string;
  from?: string;
  to?: string;
  setBy?: string;
  setAt?: string;
};

function isNameMismatchIssue(entry: AiIssueEntry): entry is { code: "name_mismatch"; message?: string; nameOnDocument?: string; nurseName?: string } {
  if (typeof entry === "string") return entry.startsWith("name_mismatch");
  return !!(entry && typeof entry === "object" && entry.code === "name_mismatch");
}

function isManualOverrideIssue(entry: AiIssueEntry): entry is { code: "manual_category_override"; message?: string; from?: string; to?: string; setBy?: string; setAt?: string } {
  return !!(entry && typeof entry === "object" && entry.code === "manual_category_override");
}

function describeNameMismatch(entry: AiIssueEntry): { documentName?: string; profileName?: string; message: string } {
  if (typeof entry === "string") {
    return { message: entry };
  }
  return {
    documentName: entry.nameOnDocument,
    profileName: entry.nurseName,
    message: entry.message || "Name on document doesn't match the candidate's profile",
  };
}

function describeIssue(entry: AiIssueEntry): string {
  if (typeof entry === "string") return entry;
  return entry.message || JSON.stringify(entry);
}

function useDocumentMutations(candidateId: string) {
  const { toast } = useToast();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}/documents`] });
    queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
    queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "audit-log"] });
    queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
  };
  const deleteDoc = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("DELETE", `/api/documents/${docId}`);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Document deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message || "Could not delete document", variant: "destructive" });
    },
  });
  const confirmName = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("POST", `/api/documents/${docId}/confirm-name-match`, {});
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Name match confirmed", description: "The mismatch warning has been cleared." });
    },
    onError: (err: any) => {
      toast({ title: "Could not confirm", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });
  const changeCategory = useMutation({
    mutationFn: async ({ docId, category }: { docId: string; category: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/${docId}/category`, { category });
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "mandatory-training"] });
      const added: string[] = data?.trainingModulesAdded || [];
      const removed: number = data?.removedTrainingRows || 0;
      let description: string | undefined;
      if (added.length > 0) {
        description = `Auto-recorded ${added.length} training module${added.length === 1 ? "" : "s"}: ${added.join(", ")}.`;
      } else if (removed > 0) {
        description = `Cleared ${removed} stale training record${removed === 1 ? "" : "s"} from this document.`;
      }
      toast({ title: "Category updated", description });
    },
    onError: (err: any) => {
      toast({ title: "Could not change category", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });
  return { deleteDoc, confirmName, changeCategory };
}

// Categories the admin can choose from for a manual override. These mirror
// the server's ALLOWED_CATEGORIES set in routes/documents.ts. Keeping a
// dictionary here gives us nicer human labels in the dropdown without
// shipping a shared constants file.
const DOCUMENT_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "training_certificate", label: "Training certificate" },
  { value: "identity", label: "Identity (passport / ID)" },
  { value: "right_to_work", label: "Right to work" },
  { value: "dbs", label: "DBS check" },
  { value: "nmc", label: "NMC registration" },
  { value: "health", label: "Health (occ. health, immunisations)" },
  { value: "indemnity", label: "Professional indemnity" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "competency_evidence", label: "Competency evidence" },
  { value: "profile", label: "Profile (CV, headshot)" },
  { value: "other", label: "Other / uncategorised" },
];

function DocumentCategorySelect({
  docId,
  currentCategory,
  onChange,
  isPending,
}: {
  docId: string;
  currentCategory?: string | null;
  onChange: (docId: string, category: string) => void;
  isPending?: boolean;
}) {
  const { user } = useAuth();
  // Only admins can re-categorise; for everyone else the dropdown is hidden
  // entirely so the row stays compact and the action is gated server-side.
  if (user?.role !== "admin") return null;

  const value = currentCategory || "other";
  const knownValues = new Set(DOCUMENT_CATEGORY_OPTIONS.map((o) => o.value));
  // If the doc has a legacy/unexpected category, surface it as a one-off
  // option so the Select doesn't render an empty value.
  const options = knownValues.has(value)
    ? DOCUMENT_CATEGORY_OPTIONS
    : [{ value, label: value }, ...DOCUMENT_CATEGORY_OPTIONS];

  return (
    <Select
      value={value}
      disabled={isPending}
      onValueChange={(next) => {
        if (next && next !== value) onChange(docId, next);
      }}
    >
      <SelectTrigger
        className="h-7 w-[180px] text-xs"
        data-testid={`select-category-${docId}`}
        title="Change document category (admin)"
      >
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DocumentDeleteButton({ docId, filename, candidateName, onDelete, isDeleting }: { docId: string; filename?: string | null; candidateName?: string | null; onDelete: (docId: string) => void; isDeleting?: boolean }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
      disabled={isDeleting}
      onClick={() => {
        const fileLabel = filename || "this document";
        const who = candidateName ? ` from ${candidateName}` : "";
        if (window.confirm(`Delete "${fileLabel}"${who}? The file will be removed from the record and from disk and cannot be undone.`)) {
          onDelete(docId);
        }
      }}
      data-testid={`button-delete-doc-${docId}`}
      tooltip="Permanently delete this document from the record and disk. Cannot be undone."
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function DocumentAiIssues({
  issues,
  status,
  documentId,
  filename,
  candidateName,
  onConfirmNameMatch,
  isConfirming,
  onDeleteDocument,
  isDeleting,
}: {
  issues?: AiIssueEntry[] | null;
  status?: string | null;
  documentId: string;
  filename?: string | null;
  candidateName?: string | null;
  onConfirmNameMatch?: (docId: string) => void;
  isConfirming?: boolean;
  onDeleteDocument?: (docId: string) => void;
  isDeleting?: boolean;
}) {
  if (!issues || !Array.isArray(issues) || issues.length === 0) return null;
  const overrideEntries = issues.filter(isManualOverrideIssue);
  const nameMismatchEntries = issues.filter(isNameMismatchIssue);
  const otherEntries = issues.filter((e) => !isNameMismatchIssue(e) && !isManualOverrideIssue(e));

  // Show the manual override marker even when status is "pass" so admins can
  // always tell the category was set by hand. Other issue types only render
  // when there's an actual problem.
  const showProblems = !!status && status !== "pass" && (nameMismatchEntries.length > 0 || otherEntries.length > 0);
  if (overrideEntries.length === 0 && !showProblems) return null;

  const borderColor = status === "fail" ? "border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20" : "border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20";
  const textColor = status === "fail" ? "text-red-300" : "text-amber-300";

  return (
    <div className="mx-3 mb-1 mt-1 space-y-1.5" data-testid="ai-issues-list">
      {overrideEntries.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 p-2">
          {overrideEntries.map((entry, i) => (
            <div key={`mo-${i}`} className="flex items-start gap-2 text-xs text-blue-900 dark:text-blue-200">
              <UserCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
              <div className="flex-1">
                <p className="font-medium">Category set by admin</p>
                <p className="text-blue-800/80 dark:text-blue-300/80">
                  {entry.from && entry.to ? `Was "${entry.from}", now "${entry.to}".` : entry.message}
                  {entry.setBy ? ` (by ${entry.setBy})` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {showProblems && (
        <div className={`rounded-md border p-2 space-y-2 ${borderColor}`}>
      {nameMismatchEntries.length > 0 && (
        <div className="space-y-1.5" data-testid={`ai-name-mismatch-${documentId}`}>
          {nameMismatchEntries.map((entry, i) => {
            const detail = describeNameMismatch(entry);
            return (
              <div key={`nm-${i}`} className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-100/40 dark:bg-amber-900/20 p-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                <div className="flex-1 text-xs space-y-1">
                  <p className="font-medium text-amber-900 dark:text-amber-200">Name on document doesn't match the candidate's profile</p>
                  {(detail.documentName || detail.profileName) && (
                    <p className="text-amber-800 dark:text-amber-300">
                      {detail.documentName && (<>Document: <span className="font-mono">"{detail.documentName}"</span></>)}
                      {detail.documentName && detail.profileName && " · "}
                      {detail.profileName && (<>Profile: <span className="font-mono">"{detail.profileName}"</span></>)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {onConfirmNameMatch && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1"
                      disabled={isConfirming}
                      onClick={() => onConfirmNameMatch(documentId)}
                      data-testid={`button-confirm-name-${documentId}`}
                      tooltip="Override the name-mismatch flag and confirm this document belongs to the candidate."
                    >
                      <UserCheck className="h-3 w-3" />
                      {isConfirming ? "Confirming..." : "Confirm it's correct"}
                    </Button>
                  )}
                  {onDeleteDocument && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1 text-red-600 hover:text-red-700 border-red-300/60"
                      disabled={isDeleting}
                      onClick={() => {
                        const fileLabel = filename || "this document";
                        const who = candidateName ? ` from ${candidateName}` : "";
                        if (window.confirm(`Delete "${fileLabel}"${who}? The file will be removed from the record and from disk and cannot be undone.`)) {
                          onDeleteDocument(documentId);
                        }
                      }}
                      data-testid={`button-delete-doc-mismatch-${documentId}`}
                      tooltip="Permanently delete this mismatched document from the record and disk. Cannot be undone."
                    >
                      <Trash2 className="h-3 w-3" />
                      {isDeleting ? "Deleting..." : "Delete document"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {otherEntries.length > 0 && (
        <ul className={`text-xs space-y-1 ${textColor}`}>
          {otherEntries.map((issue, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{describeIssue(issue)}</span>
            </li>
          ))}
        </ul>
      )}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ candidateId, candidateName }: { candidateId: string; candidateName?: string }) {
  const { data: docs, isLoading } = useQuery<any[]>({
    queryKey: [`/api/candidates/${candidateId}/documents`],
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      if (data?.some((d: any) => d.aiStatus === "pending")) return 5000;
      return false;
    },
  });
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const {
    deleteDoc: deleteDocMutation,
    confirmName: confirmNameMutation,
    changeCategory: changeCategoryMutation,
  } = useDocumentMutations(candidateId);
  const [lastClassification, setLastClassification] = useState<{
    detectedCategory: string;
    detectedType: string;
    matchedTrainingModules: string[];
    autoRecorded: string[];
    confidence: string;
    summary: string;
    cv?: {
      detected: boolean;
      addedEntries: { id: string; employer: string; jobTitle: string; startDate: string | null; endDate: string | null; isCurrent: boolean }[];
      skippedAsDuplicate: number;
      candidateName: string | null;
      confidence: string;
      notes: string | null;
    } | null;
  } | null>(null);

  const handleSmartUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setLastClassification(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/candidates/${candidateId}/smart-document-upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const result = await res.json();
      setLastClassification({
        detectedCategory: result.classification.detectedCategory,
        detectedType: result.classification.detectedType,
        matchedTrainingModules: result.classification.matchedTrainingModules,
        autoRecorded: result.autoRecorded,
        confidence: result.classification.confidence,
        summary: result.classification.summary,
        cv: result.cv ?? null,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}/documents`] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "mandatory-training"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}/employment-history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      const cvAdded = result.cv?.addedEntries?.length ?? 0;
      const trainingAdded = result.autoRecorded?.length ?? 0;
      const piFilled = result.personalInfo?.filled || [];
      const piConflicts = result.personalInfo?.conflicts || [];
      const FIELD_LABELS: Record<string, string> = {
        dateOfBirth: "DOB",
        address: "address",
        phone: "phone",
        passportNumber: "passport number",
        nmcPin: "NMC PIN",
        dbsNumber: "DBS number",
      };
      const piFilledLabel = piFilled.length
        ? `auto-filled ${piFilled.map((f: any) => FIELD_LABELS[f.field] || f.field).join(", ")}`
        : null;
      const piConflictLabel = piConflicts.length
        ? `${piConflicts.length} field${piConflicts.length === 1 ? "" : "s"} differ from existing profile — review`
        : null;
      const extras = [
        trainingAdded > 0 ? `${trainingAdded} training module(s) auto-recorded` : null,
        cvAdded > 0 ? `${cvAdded} work history entr${cvAdded === 1 ? "y" : "ies"} added from CV` : null,
        piFilledLabel,
        piConflictLabel,
      ].filter(Boolean).join(" — ");
      toast({
        title: result.aiAvailable === false ? "Document Uploaded" : "Document Uploaded & Classified",
        description: result.aiAvailable === false
          ? "Document saved successfully. AI classification is currently unavailable — you can categorise it manually."
          : `Identified as: ${result.classification.detectedType}${extras ? ` — ${extras}` : ""}`,
        variant: piConflicts.length ? "destructive" : "default",
      });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message || "Could not process document", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (isLoading) return <Skeleton className="h-40" />;

  const allDocs = docs || [];
  const categories: Record<string, string> = {
    identity: "Identity",
    right_to_work: "Right to Work",
    profile: "Profile / CV",
    competency_evidence: "Competency Evidence",
    training_certificate: "Training Certificates",
    health: "Health Records",
    indemnity: "Indemnity",
    dbs: "DBS",
    other: "Other",
  };

  const grouped = allDocs.reduce((acc: Record<string, any[]>, doc: any) => {
    const cat = doc.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-6" data-testid="tab-documents">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <p className="text-sm font-medium">Smart Document Upload</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload any document — AI will identify what it is, categorise it, and automatically match it against training requirements.
        </p>
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleSmartUpload}
            disabled={uploading}
            data-testid="input-smart-upload"
          />
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild disabled={uploading} tooltip="Upload any document — AI auto-classifies it and matches training requirements.">
            <span>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? "Analysing document..." : "Upload Document"}
            </span>
          </Button>
        </label>
      </div>

      {lastClassification && (
        <div className="rounded-md border border-emerald-800/50 bg-emerald-950/30 p-4 space-y-2" data-testid="smart-upload-result">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-emerald-300">Document Classified</p>
              <p className="text-xs text-muted-foreground">{lastClassification.summary}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="outline" className="text-[10px]">
                  Type: {lastClassification.detectedType}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Category: {categories[lastClassification.detectedCategory] || lastClassification.detectedCategory}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Confidence: {lastClassification.confidence}
                </Badge>
              </div>
              {lastClassification.matchedTrainingModules.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Training modules matched:</p>
                  <ul className="mt-1 list-disc list-inside text-xs text-emerald-300/80">
                    {lastClassification.matchedTrainingModules.map(m => (
                      <li key={m}>
                        {m}
                        {lastClassification.autoRecorded.includes(m) && (
                          <span className="text-emerald-400 ml-1">(auto-recorded)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lastClassification.cv?.detected && (
                <div className="mt-3 rounded-md border border-blue-800/50 bg-blue-950/30 p-3" data-testid="cv-extraction-result">
                  <p className="text-xs font-medium text-blue-300">
                    CV detected — work history populated
                    {lastClassification.cv.candidateName ? ` for ${lastClassification.cv.candidateName}` : ""}
                  </p>
                  {lastClassification.cv.addedEntries.length > 0 ? (
                    <ul className="mt-1.5 list-disc list-inside text-xs text-blue-200/80 space-y-0.5">
                      {lastClassification.cv.addedEntries.map(entry => (
                        <li key={entry.id}>
                          <span className="font-medium">{entry.jobTitle}</span> @ {entry.employer}
                          <span className="text-muted-foreground ml-1">
                            ({entry.startDate || "?"} – {entry.isCurrent ? "Present" : (entry.endDate || "?")})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No new entries added — work history already up to date.
                    </p>
                  )}
                  {lastClassification.cv.skippedAsDuplicate > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {lastClassification.cv.skippedAsDuplicate} entr{lastClassification.cv.skippedAsDuplicate === 1 ? "y" : "ies"} skipped (already on file or missing dates).
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {allDocs.length === 0 ? (
        <div className="text-center py-8">
          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No documents uploaded yet — use the smart upload above</p>
        </div>
      ) : (
      <>
      <p className="text-sm text-muted-foreground">{allDocs.length} document{allDocs.length !== 1 ? "s" : ""} uploaded</p>
      {Object.entries(grouped).map(([cat, catDocs]) => (
        <div key={cat} className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {categories[cat] || cat}
          </h4>
          {catDocs.map((doc: any) => (
            <div key={doc.id} className="space-y-0">
              <div className="flex items-center justify-between rounded-lg border border-card-border p-3" data-testid={`doc-item-${doc.id}`}>
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{doc.type || doc.filename}</p>
                      <DocumentAiIndicator status={doc.aiStatus} />
                    </div>
                    {doc.filePath ? (
                      <DocumentLink doc={doc} />
                    ) : (
                      <p className="text-xs text-muted-foreground">{doc.filename}</p>
                    )}
                    {doc.fileSize && (
                      <p className="text-xs text-muted-foreground">{(doc.fileSize / 1024).toFixed(1)} KB</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {doc.uploadedBy === "nurse" && <PortalBadge />}
                  {doc.expiryDate && (
                    <Badge variant="outline" className="text-xs">Expires: {doc.expiryDate}</Badge>
                  )}
                  {doc.sharepointUrl && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild data-testid={`btn-sharepoint-${doc.id}`} tooltip="Open this document in SharePoint.">
                      <a href={doc.sharepointUrl} target="_blank" rel="noopener noreferrer" title="Open in SharePoint">
                        <Globe className="h-3.5 w-3.5 text-blue-400" />
                      </a>
                    </Button>
                  )}
                  {doc.filePath && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild tooltip="Open this document in a new tab.">
                      <a href={doc.filePath} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <DocumentCategorySelect
                    docId={doc.id}
                    currentCategory={doc.category}
                    onChange={(id, category) => changeCategoryMutation.mutate({ docId: id, category })}
                    isPending={changeCategoryMutation.isPending && (changeCategoryMutation.variables as any)?.docId === doc.id}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => {
                      if (window.confirm(`Delete "${doc.originalFilename || doc.filename}"? This removes it from the candidate's record and from disk and cannot be undone.`)) {
                        deleteDocMutation.mutate(doc.id);
                      }
                    }}
                    disabled={deleteDocMutation.isPending}
                    data-testid={`button-delete-doc-${doc.id}`}
                    title="Delete document"
                    tooltip="Permanently delete this document from the record and disk. Cannot be undone."
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <DocumentAiIssues
                issues={doc.aiIssues}
                status={doc.aiStatus}
                documentId={doc.id}
                filename={doc.originalFilename || doc.filename}
                candidateName={candidateName}
                onConfirmNameMatch={(id) => confirmNameMutation.mutate(id)}
                isConfirming={confirmNameMutation.isPending && confirmNameMutation.variables === doc.id}
                onDeleteDocument={(id) => deleteDocMutation.mutate(id)}
                isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
              />
            </div>
          ))}
        </div>
      ))}
      </>
      )}
    </div>
  );
}

function AuditSummaryPanel({ candidateId }: { candidateId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const summaryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/audit-summary`);
      const data = await res.json();
      return data.summary as string;
    },
    onSuccess: (data) => {
      setSummary(data);
    },
    onError: () => {
      toast({ title: "Summary generation failed", description: "Could not generate the audit summary. Please try again.", variant: "destructive" });
    },
  });

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <div className="mb-6">
      {!summary && (
        <Button
          onClick={() => summaryMutation.mutate()}
          disabled={summaryMutation.isPending}
          variant="outline"
          size="sm"
          data-testid="button-generate-summary"
          tooltip="Generate an AI summary of this candidate's audit history."
        >
          {summaryMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating Summary…</>
          ) : (
            <><FileText className="h-4 w-4 mr-2" />Generate Summary</>
          )}
        </Button>
      )}
      {summary && (
        <Card className="mt-3" data-testid="audit-summary-panel">
          <div className="flex items-center justify-between p-4 pb-2">
            <p className="text-sm font-medium">AI Audit Summary</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopy} data-testid="button-copy-summary" tooltip="Copy this AI summary to your clipboard.">
                {copied ? <><CheckCircle className="h-3.5 w-3.5 mr-1" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setSummary(null); }} data-testid="button-clear-summary" tooltip="Hide this AI summary panel.">
                Dismiss
              </Button>
            </div>
          </div>
          <CardContent>
            <AIMarkdown content={summary} data-testid="text-audit-summary" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditTimeline({ candidateId }: { candidateId: string }) {
  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/candidates", candidateId, "audit-log"],
  });

  if (isLoading) return <Skeleton className="h-20" />;

  return (
    <div>
      <AuditSummaryPanel candidateId={candidateId} />
      <div className="space-y-3" data-testid="audit-timeline">
        {(logs || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No audit entries yet</p>
        ) : (
          (logs || []).slice(0, 20).map(log => (
            <div key={log.id} className="flex items-start gap-3 text-sm">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-foreground">{log.action.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {log.agentName} &middot; {log.timestamp ? new Date(log.timestamp).toLocaleString("en-GB") : ""}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CandidateDetailInner({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();

  const { data: candidate, isLoading: candidateLoading } = useQuery<Candidate>({
    queryKey: ["/api/candidates", candidateId],
  });
  const { data: state, isLoading: stateLoading } = useQuery<OnboardingState | null>({
    queryKey: ["/api/candidates", candidateId, "onboarding-state"],
  });
  const { data: magicLinks } = useQuery<any[]>({
    queryKey: ["/api/candidates", candidateId, "magic-links"],
  });

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/magic-link`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      const url = `${window.location.origin}${data.url}`;
      navigator.clipboard.writeText(url);
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "magic-links"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "audit-log"] });
      toast({
        title: data.emailSent
          ? "Portal link sent to candidate's email"
          : "Portal link generated and copied to clipboard",
        description: data.emailSent
          ? "The invite email has been sent from your Outlook account. Link also copied to clipboard."
          : undefined,
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/nurses/${candidateId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "audit-log"] });
      toast({ title: "Candidate archived", description: "They've been hidden from the active list — you can restore them at any time." });
    },
    onError: (err: any) => {
      toast({ title: "Archive failed", description: err?.message || "Could not archive candidate", variant: "destructive" });
    },
  });

  const refillPersonalInfoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/refill-personal-info`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}/documents`] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "audit-log"] });
      const filledCount = data?.filled?.length || 0;
      const conflictCount = data?.conflicts?.length || 0;
      const scanned = data?.documentsScanned || 0;
      if (filledCount === 0 && conflictCount === 0) {
        toast({
          title: "Nothing new to fill in",
          description: scanned === 0
            ? "There aren't any documents on file that we can read personal details from yet."
            : `Looked at ${scanned} document${scanned === 1 ? "" : "s"} — every detail is either already filled in or couldn't be read.`,
        });
        return;
      }
      const filledLabels = (data.filled as any[]).map(f => f.label);
      const uniqueFilled = Array.from(new Set(filledLabels));
      const parts = [
        uniqueFilled.length ? `filled in ${uniqueFilled.join(", ")}` : null,
        conflictCount ? `${conflictCount} difference${conflictCount === 1 ? "" : "s"} need your review` : null,
      ].filter(Boolean).join(" — ");
      toast({
        title: "Personal details updated from documents",
        description: `${parts}. Reviewed ${scanned} document${scanned === 1 ? "" : "s"}.`,
        variant: conflictCount ? "destructive" : "default",
      });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't read personal details", description: err?.message || "Something went wrong while reading the documents.", variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/nurses/${candidateId}/restore`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "audit-log"] });
      toast({ title: "Candidate restored", description: "They're back on the active list." });
    },
    onError: (err: any) => {
      toast({ title: "Restore failed", description: err?.message || "Could not restore candidate", variant: "destructive" });
    },
  });

  if (candidateLoading || stateLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32" />
          <Skeleton className="h-96" />
        </div>
      </AppLayout>
    );
  }

  if (!candidate) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg font-medium">Candidate not found</p>
          <Link href="/candidates">
            <Button variant="outline" className="mt-4">Back to Candidates</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }


  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center gap-3 animate-fade-slide-up stagger-1">
          <Link href="/candidates">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
        </div>

        <div className="flex items-start justify-between animate-fade-slide-up stagger-2">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg transition-transform duration-300 hover:scale-105">
              {candidate.fullName.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-foreground" data-testid="text-candidate-name">{candidate.fullName}</h1>
                <StatusBadge status={candidate.currentStage} isStage />
                <StatusBadge status={candidate.status} />
                {candidate.archivedAt && (
                  <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50" data-testid="badge-candidate-archived">
                    <Archive className="h-3 w-3 mr-1" /> Archived{candidate.archivedBy ? ` by ${candidate.archivedBy}` : ""}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                {candidate.band && <span>Band {candidate.band}</span>}
                {candidate.nmcPin && <span>NMC: {candidate.nmcPin}</span>}
                {candidate.specialisms && <span>{candidate.specialisms.join(", ")}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-candidate-actions"
                  disabled={
                    generateLinkMutation.isPending ||
                    archiveMutation.isPending ||
                    restoreMutation.isPending ||
                    refillPersonalInfoMutation.isPending
                  }
                  tooltip="Open candidate actions menu (portal link, archive, restore, refill)."
                >
                  {(generateLinkMutation.isPending || archiveMutation.isPending || restoreMutation.isPending || refillPersonalInfoMutation.isPending)
                    ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    : <MoreHorizontal className="h-4 w-4 mr-1.5" />}
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>What would you like to do?</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="action-send-portal-invite"
                  disabled={generateLinkMutation.isPending}
                  onSelect={(e) => { e.preventDefault(); generateLinkMutation.mutate(); }}
                >
                  <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>Email the candidate their portal link</span>
                    <span className="text-[11px] text-muted-foreground">Sends the branded Livaware welcome with a fresh portal link to {candidate.email || "their inbox"} — and reminds them they can sign back in any time at onboard.livaware.co.uk.</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="action-download-pdf"
                  onSelect={(e) => {
                    e.preventDefault();
                    const a = document.createElement("a");
                    a.href = `/api/candidates/${candidateId}/pdf-report`;
                    a.download = "";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  <FileDown className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>Download the full file as a PDF</span>
                    <span className="text-[11px] text-muted-foreground">A printable summary of everything on this record</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="action-refill-personal-info"
                  disabled={refillPersonalInfoMutation.isPending}
                  onSelect={(e) => { e.preventDefault(); refillPersonalInfoMutation.mutate(); }}
                >
                  <Wand2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{refillPersonalInfoMutation.isPending ? "Reading documents…" : "Fill in missing details from their documents"}</span>
                    <span className="text-[11px] text-muted-foreground">Looks at the passport, NMC certificate, DBS, etc. and fills any blank fields</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {candidate.archivedAt ? (
                  <DropdownMenuItem
                    data-testid="action-restore-candidate"
                    disabled={restoreMutation.isPending}
                    onSelect={(e) => { e.preventDefault(); restoreMutation.mutate(); }}
                  >
                    <ArchiveRestore className="h-4 w-4 mr-2 text-emerald-500" />
                    <div className="flex flex-col">
                      <span>Bring this candidate back to the active list</span>
                      <span className="text-[11px] text-muted-foreground">Reverses the archive action</span>
                    </div>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    data-testid="action-archive-candidate"
                    disabled={archiveMutation.isPending}
                    className="text-red-600 focus:text-red-600"
                    onSelect={(e) => {
                      e.preventDefault();
                      if (window.confirm(`Archive ${candidate.fullName}? They'll be hidden from the active list but can be restored at any time.`)) {
                        archiveMutation.mutate();
                      }
                    }}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    <div className="flex flex-col">
                      <span>Hide this candidate from the active list</span>
                      <span className="text-[11px] text-muted-foreground/80">You can bring them back at any time</span>
                    </div>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {magicLinks && magicLinks.length > 0 && (
              <div className="text-xs text-muted-foreground text-right">
                {magicLinks[0].usedAt ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    Portal accessed {new Date(magicLinks[0].usedAt).toLocaleDateString("en-GB")}
                  </span>
                ) : (
                  <span>Link sent, not yet accessed</span>
                )}
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/portal/${magicLinks[0].token}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: "Portal link copied to clipboard" });
                  }}
                  className="inline-flex items-center gap-1 text-primary hover:underline mt-0.5"
                  data-testid="button-copy-portal-link"
                >
                  <Copy className="h-3 w-3" />
                  Copy link
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="animate-fade-in stagger-3">
          <SectionTabs candidateId={candidateId} candidate={candidate} stepStatuses={(state?.stepStatuses as Record<string, string>) || {}} currentStep={state?.currentStep || 1} />
        </div>
      </div>
    </AppLayout>
  );
}

interface ComplianceScanSummary {
  documentsScanned: number;
  documentsReclassified: number;
  cvDocsScanned: number;
  cvEntriesAdded: number;
  cvEntriesSkipped: number;
  cvEducationAdded: number;
  cvEducationSkipped: number;
  certDocsScanned: number;
  trainingModulesAdded: number;
  errors: string[];
}

function CqcComplianceCheck({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [scan, setScan] = useState<ComplianceScanSummary | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/compliance-check`);
      return res.json();
    },
    onSuccess: (data: { result: string; scan?: ComplianceScanSummary }) => {
      setResult(data.result);
      setScan(data.scan ?? null);
      setGeneratedAt(new Date().toLocaleString("en-GB"));
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "employment-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "education-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "mandatory-training"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "documents"] });
    },
  });

  const verdictColor = result?.includes("NON-COMPLIANT")
    ? "border-red-500/40 bg-red-50 dark:bg-red-950/20"
    : result?.includes("PARTIALLY COMPLIANT")
      ? "border-amber-500/40 bg-amber-50 dark:bg-amber-950/20"
      : result?.includes("COMPLIANT")
        ? "border-green-500/40 bg-green-50 dark:bg-green-950/20"
        : "border-card-border";

  return (
    <Card className="border border-card-border" data-testid="card-cqc-compliance">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#C8A96E]" />
            <CardTitle className="text-base">CQC Regulation 19 / Schedule 3 Compliance Check</CardTitle>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid="button-run-compliance-check"
            tooltip="Run an AI CQC Regulation 19 / Schedule 3 compliance check across this candidate's record."
          >
            {mutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analysing…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />{result ? "Re-run Check" : "Run AI Check"}</>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          AI-powered assessment against CQC Regulation 19 (Fit and Proper Persons) and Schedule 3 requirements
        </p>
      </CardHeader>
      <CardContent>
        {mutation.isError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-sm" data-testid="compliance-check-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to run compliance check. Please try again.
          </div>
        )}
        {!result && !mutation.isPending && !mutation.isError && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground" data-testid="compliance-check-empty">
            <ClipboardCheck className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No compliance check has been run yet</p>
            <p className="text-xs mt-1">Click "Run AI Check" to generate a full CQC Regulation 19 / Schedule 3 assessment for {candidateName}</p>
          </div>
        )}
        {mutation.isPending && (
          <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="compliance-check-loading">
            <Loader2 className="h-8 w-8 animate-spin text-[#C8A96E] mb-3" />
            <p className="text-sm font-medium">Analysing candidate record…</p>
            <p className="text-xs text-muted-foreground mt-1">Checking identity, NMC, DBS, references, training, health, and all Schedule 3 requirements</p>
          </div>
        )}
        {result && !mutation.isPending && (
          <div className={`rounded-lg border p-4 ${verdictColor}`} data-testid="compliance-check-result">
            {generatedAt && (
              <p className="text-[10px] text-muted-foreground mb-3 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Generated {generatedAt}
              </p>
            )}
            {scan && scan.documentsScanned > 0 && (
              <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/30" data-testid="compliance-check-scan-summary">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Document scan</p>
                <p className="text-blue-800 dark:text-blue-200">
                  Scanned {scan.documentsScanned} document{scan.documentsScanned === 1 ? "" : "s"} ·{" "}
                  {scan.cvDocsScanned} CV{scan.cvDocsScanned === 1 ? "" : "s"} ·{" "}
                  {scan.certDocsScanned} certificate{scan.certDocsScanned === 1 ? "" : "s"}
                  {scan.documentsReclassified > 0 && (
                    <> · {scan.documentsReclassified} re-classified</>
                  )}
                  .
                </p>
                {(scan.cvEntriesAdded > 0 || scan.cvEducationAdded > 0 || scan.trainingModulesAdded > 0) && (
                  <p className="text-blue-800 dark:text-blue-200 mt-1">
                    Added {scan.cvEntriesAdded} work history entr{scan.cvEntriesAdded === 1 ? "y" : "ies"},{" "}
                    {scan.cvEducationAdded} education entr{scan.cvEducationAdded === 1 ? "y" : "ies"} and{" "}
                    {scan.trainingModulesAdded} training record{scan.trainingModulesAdded === 1 ? "" : "s"}.
                  </p>
                )}
                {scan.cvEntriesAdded === 0 && scan.cvEducationAdded === 0 && scan.trainingModulesAdded === 0 && (
                  <p className="text-blue-800 dark:text-blue-200 mt-1">No new entries — records already up to date.</p>
                )}
                {scan.errors.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
                    {scan.errors.length} document{scan.errors.length === 1 ? "" : "s"} could not be processed.
                  </p>
                )}
              </div>
            )}
            <AIMarkdown content={result} className="text-sm" data-testid="compliance-check-markdown" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreboardTab({ candidateId, candidate }: { candidateId: string; candidate: Candidate }) {
  const { isAdmin: isAdminRole } = useAuthRole();
  const { toast } = useToast();
  const [fastTrackReason, setFastTrackReason] = useState(candidate.fastTrackReason || "");
  const [isEditingReason, setIsEditingReason] = useState(false);
  const suspectBurstThreshold = useSuspectBurstCharThreshold();

  const saveReasonMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest("PATCH", `/api/nurses/${candidateId}`, { fastTrackReason: reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/candidates/${candidateId}`] });
      setIsEditingReason(false);
      toast({ title: "Fast-track reason saved" });
    },
  });

  const { data: assessment, isLoading, error } = useQuery<{
    id: number;
    nurseId: string | null;
    nurseName: string;
    nurseEmail: string;
    nursePhone: string | null;
    responses: Array<{
      questionId: number;
      tag: string;
      domain: string;
      prompt: string;
      response: string;
      timeSpent: number;
      timeLimit: number;
      pasteAttempts?: number;
      keystrokeCount?: number;
      maxBurstChars?: number;
    }>;
    aiAnalysis: string | null;
    emailSent: boolean | null;
    completedAt: string | null;
    aiStatus?: string | null;
    aiError?: string | null;
    aiAttempts?: number | null;
    emailStatus?: string | null;
    emailError?: string | null;
    emailAttempts?: number | null;
    emailSentAt?: string | null;
  }>({
    queryKey: [`/api/preboard/assessments/by-nurse/${candidateId}`],
    retry: false,
  });

  const rerunAiMutation = useMutation({
    mutationFn: async () => {
      if (!assessment?.id) throw new Error("No assessment");
      const res = await apiRequest("POST", `/api/preboard/assessments/${assessment.id}/rerun-ai`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/preboard/assessments/by-nurse/${candidateId}`] });
      toast({ title: "AI analysis re-run", description: "Analysis regenerated." });
    },
    onError: (err: Error) => {
      toast({ title: "AI re-run failed", description: err.message, variant: "destructive" });
    },
  });

  const resendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!assessment?.id) throw new Error("No assessment");
      const res = await apiRequest("POST", `/api/preboard/assessments/${assessment.id}/resend-email`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/preboard/assessments/by-nurse/${candidateId}`] });
      toast({ title: "Report email sent" });
    },
    onError: (err: Error) => {
      toast({ title: "Resend failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isServerError = error instanceof Error && !error.message.startsWith("4");

  if (isServerError) {
    return (
      <Card className="border border-destructive/20">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <AlertCircle className="h-7 w-7 text-destructive/60" />
          </div>
          <p className="font-serif text-lg text-foreground mb-1">Failed to load assessment</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Something went wrong while fetching the preboard assessment. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fastTrackBanner = candidate.fastTracked ? (
    <Card className="border border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <Zap className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-sm text-foreground">Fast-Tracked to Onboarding</p>
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10">Skipped Preboard</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              This candidate was fast-tracked past the preboarding stage directly into onboarding.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Reason for Fast-Track</Label>
              {isEditingReason ? (
                <div className="flex gap-2">
                  <Textarea
                    value={fastTrackReason}
                    onChange={(e) => setFastTrackReason(e.target.value)}
                    placeholder="Enter reason for fast-tracking this candidate..."
                    className="text-sm min-h-[60px] flex-1"
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      onClick={() => saveReasonMutation.mutate(fastTrackReason)}
                      disabled={saveReasonMutation.isPending || !fastTrackReason.trim()}
                      tooltip="Save the fast-track reason for this candidate."
                    >
                      {saveReasonMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setFastTrackReason(candidate.fastTrackReason || ""); setIsEditingReason(false); }}
                      tooltip="Discard your changes to the fast-track reason."
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-start gap-2 cursor-pointer group rounded-md border border-transparent hover:border-border p-2 -m-2"
                  onClick={() => setIsEditingReason(true)}
                >
                  {candidate.fastTrackReason ? (
                    <p className="text-sm text-foreground flex-1">{candidate.fastTrackReason}</p>
                  ) : (
                    <p className="text-sm text-amber-600 italic flex-1">No reason provided — click to add one</p>
                  )}
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 mt-0.5 shrink-0" />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ) : null;

  if (!assessment) {
    return (
      <div className="space-y-4">
        {fastTrackBanner}
        {!candidate.fastTracked && (
          <Card className="border border-card-border">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                <ClipboardCheck className="h-7 w-7 text-primary/40" />
              </div>
              <p className="font-serif text-lg text-foreground mb-1">No preboard assessment submitted yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                An assessment will appear here once the candidate completes their preboard questionnaire.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const responses = Array.isArray(assessment.responses) ? assessment.responses : [];
  const totalPasteAttempts = responses.reduce(
    (sum, r) => sum + (typeof r.pasteAttempts === "number" ? r.pasteAttempts : 0),
    0,
  );
  const flaggedQuestionCount = responses.filter(
    (r) => typeof r.pasteAttempts === "number" && r.pasteAttempts > 0,
  ).length;
  const burstFlaggedCount = responses.filter(
    (r) => typeof r.maxBurstChars === "number" && r.maxBurstChars >= suspectBurstThreshold,
  ).length;
  const maxBurstAcrossResponses = responses.reduce(
    (m, r) => Math.max(m, typeof r.maxBurstChars === "number" ? r.maxBurstChars : 0),
    0,
  );

  return (
    <div className="space-y-4">
      {fastTrackBanner}
      <div className="flex items-center gap-4 flex-wrap">
        <Card className="border border-card-border flex-1 min-w-[140px]">
          <CardContent className="p-6 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">Questions</p>
            <p className="font-serif text-4xl font-light text-foreground">{responses.length}</p>
          </CardContent>
        </Card>
        {assessment.completedAt && (
          <Card className="border border-card-border flex-1 min-w-[200px]">
            <CardContent className="p-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">Completed</p>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Calendar className="h-4 w-4 text-muted-foreground/40" />
                {new Date(assessment.completedAt).toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            </CardContent>
          </Card>
        )}
        {totalPasteAttempts > 0 && (
          <Card className="border border-destructive/30 bg-destructive/5 flex-1 min-w-[200px]" data-testid="card-paste-attempts-summary">
            <CardContent className="p-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-destructive/70 mb-1">Integrity Notice</p>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span data-testid="text-paste-attempts-summary">
                  {totalPasteAttempts} blocked paste/drop {totalPasteAttempts === 1 ? "attempt" : "attempts"} across {flaggedQuestionCount} {flaggedQuestionCount === 1 ? "question" : "questions"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
        {burstFlaggedCount > 0 && (
          <Card className="border border-destructive/30 bg-destructive/5 flex-1 min-w-[200px]" data-testid="card-suspect-typing-summary">
            <CardContent className="p-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-destructive/70 mb-1">Suspect Typing Pattern</p>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Activity className="h-4 w-4 text-destructive" />
                <span data-testid="text-suspect-typing-summary">
                  {burstFlaggedCount} {burstFlaggedCount === 1 ? "answer" : "answers"} contain a single chunk of {maxBurstAcrossResponses}+ chars (threshold {suspectBurstThreshold}). Possible bypassed paste, voice input, or scripted entry.
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <PreboardDeliveryPanel
        isAdmin={isAdminRole}
        aiStatus={assessment.aiStatus}
        aiError={assessment.aiError}
        aiAttempts={assessment.aiAttempts}
        emailStatus={assessment.emailStatus}
        emailError={assessment.emailError}
        emailAttempts={assessment.emailAttempts}
        emailSentAt={assessment.emailSentAt}
        onRerunAi={() => rerunAiMutation.mutate()}
        onResendEmail={() => resendEmailMutation.mutate()}
        rerunPending={rerunAiMutation.isPending}
        resendPending={resendEmailMutation.isPending}
      />

      {assessment.aiAnalysis && (
        <Card className="border border-primary/10 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">AI Analysis</p>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{assessment.aiAnalysis}</p>
          </CardContent>
        </Card>
      )}

      {responses.length > 0 && (
        <Card className="border border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Question Responses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {responses.map((r, i) => {
              const overTime = r.timeSpent > r.timeLimit;
              const attempts = typeof r.pasteAttempts === "number" ? r.pasteAttempts : 0;
              const maxBurst = typeof r.maxBurstChars === "number" ? r.maxBurstChars : 0;
              const keystrokes = typeof r.keystrokeCount === "number" ? r.keystrokeCount : 0;
              const suspectBurst = maxBurst >= suspectBurstThreshold;
              return (
                <div key={r.questionId || i} className="rounded-lg border p-3 bg-muted/20">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-xs font-semibold text-foreground">Q{i + 1}: {r.prompt}</p>
                    <Badge variant={overTime ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                      {r.timeSpent}s / {r.timeLimit}s
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{r.domain}</Badge>
                    <Badge variant="outline" className="text-[10px]">{r.tag}</Badge>
                    {attempts > 0 && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] gap-1"
                        data-testid={`badge-paste-attempts-${i}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {attempts} paste {attempts === 1 ? "attempt" : "attempts"} blocked
                      </Badge>
                    )}
                    {suspectBurst && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] gap-1"
                        data-testid={`badge-suspect-typing-${i}`}
                        title={`A single chunk of ${maxBurst} characters appeared at once${keystrokes > 0 ? ` (only ${keystrokes} keystroke${keystrokes === 1 ? "" : "s"} recorded)` : ""}. Possible bypassed paste, voice input, or scripted entry.`}
                      >
                        <Activity className="h-3 w-3" />
                        Suspect typing pattern ({maxBurst} char burst)
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.response}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function readQueryParams(): { section?: string; tab?: string } {
  if (typeof window === "undefined") return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    return { section: sp.get("section") ?? undefined, tab: sp.get("tab") ?? undefined };
  } catch {
    return {};
  }
}

const VALID_ONBOARDING_TABS = new Set([
  "identity", "nmc", "dbs", "right_to_work", "profile", "competency", "health", "references", "indemnity", "declarations",
]);
const VALID_COMPLIANCE_TABS = new Set(["induction", "training_compliance", "documents", "audit"]);

interface CandidateInvoiceRow {
  id: string;
  status: string;
  totalAmount: number;
  totalHours: number;
  additionalCostsTotal: number;
  submittedAt: string;
}

function CandidateInvoicesSection({ candidateId, candidate }: { candidateId: string; candidate: Candidate }) {
  const isCompleted = candidate.currentStage === "completed";
  const { data, isLoading } = useQuery<{ invoices: CandidateInvoiceRow[] }>({
    queryKey: [`/api/admin/invoices/by-nurse/${candidateId}`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/invoices/by-nurse/${candidateId}`)).json(),
  });
  const fmtPence = (p: number) => `£${(p / 100).toFixed(2)}`;
  const fmtMins = (m: number) => `${(m / 60).toFixed(2)} h`;
  return (
    <Card data-testid="card-candidate-invoices">
      <CardHeader>
        <CardTitle className="text-base">Invoices</CardTitle>
        <CardDescription>
          {isCompleted
            ? "Invoices submitted by this nurse. Use the per-nurse view on the Nurses page to submit on behalf."
            : "Invoices unlock once this candidate reaches the Nurse stage. Read-only view."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4"><Skeleton className="h-20 w-full" /></div>
        ) : !data || data.invoices.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No invoices yet.</div>
        ) : (
          <div className="divide-y" data-testid="list-candidate-invoices">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{fmtPence(inv.totalAmount + inv.additionalCostsTotal)} · {fmtMins(inv.totalHours)}</div>
                  <div className="text-[11px] text-muted-foreground">Submitted {new Date(inv.submittedAt).toLocaleDateString("en-GB")}</div>
                </div>
                <Badge variant="outline" data-testid={`badge-candidate-invoice-${inv.id}`}>{inv.status}</Badge>
              </div>
            ))}
          </div>
        )}
        <div className="p-3 border-t text-right">
          <a href="/reports/invoices" className="text-xs underline text-primary" data-testid="link-candidate-invoices-report">Open in invoices matrix →</a>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTabs({ candidateId, candidate, stepStatuses, currentStep }: { candidateId: string; candidate: Candidate; stepStatuses: Record<string, string>; currentStep: number }) {
  const initialParams = readQueryParams();
  const initialSection: "preboard" | "onboarding" | "compliance" =
    initialParams.section === "preboard" || initialParams.section === "compliance" || initialParams.section === "onboarding"
      ? initialParams.section
      : "onboarding";
  const initialSectionAny = (initialParams.section === "invoices" ? "invoices" : initialSection) as "preboard" | "onboarding" | "compliance" | "invoices";
  const [section, setSection] = useState<"preboard" | "onboarding" | "compliance" | "invoices">(initialSectionAny);
  const { isSuperAdmin } = useAuthRole();
  const initialOnboardingTab = initialParams.tab && VALID_ONBOARDING_TABS.has(initialParams.tab) ? initialParams.tab : "identity";
  const initialComplianceTab = initialParams.tab && VALID_COMPLIANCE_TABS.has(initialParams.tab) ? initialParams.tab : "induction";

  const { data: preboardAssessment } = useQuery({
    queryKey: [`/api/preboard/assessments/by-nurse/${candidateId}`],
    retry: false,
  });
  const preboardStatus = candidate.fastTracked ? "skipped" : preboardAssessment ? "completed" : "pending";

  return (
    <div className="space-y-4">
      <OnboardingAccessPanel candidateId={candidateId} />
      {isSuperAdmin && <PortalAccessPanel candidateId={candidateId} />}
      <div className="flex gap-2" data-testid="section-toggle">
        <Button
          variant={section === "preboard" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setSection("preboard")}
          data-testid="button-section-preboard"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Preboard
          <StepStatusDot status={preboardStatus} />
        </Button>
        <Button
          variant={section === "onboarding" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setSection("onboarding")}
          data-testid="button-section-onboarding"
        >
          <Users className="h-3.5 w-3.5" />
          Onboarding
        </Button>
        <Button
          variant={section === "compliance" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setSection("compliance")}
          data-testid="button-section-compliance"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Compliance
        </Button>
        <Button
          variant={section === "invoices" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setSection("invoices")}
          data-testid="button-section-invoices"
        >
          <FileText className="h-3.5 w-3.5" />
          Invoices
        </Button>
      </div>

      {section === "onboarding" && (
        <>
        <Card className="border border-card-border">
          <CardContent className="p-4">
            <StepProgress
              stepStatuses={stepStatuses}
              currentStep={currentStep}
              steps={ONBOARDING_STEPS.filter(s => s.key !== "induction")}
            />
          </CardContent>
        </Card>
        <Tabs defaultValue={initialOnboardingTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1" data-testid="tabs-onboarding">
            <TabsTrigger value="identity" className="text-xs gap-1.5"><User className="h-3 w-3" />Demographics<StepStatusDot status={stepStatuses.identity} /></TabsTrigger>
            <TabsTrigger value="nmc" className="text-xs gap-1.5"><Shield className="h-3 w-3" />NMC<StepStatusDot status={stepStatuses.nmc} /></TabsTrigger>
            <TabsTrigger value="dbs" className="text-xs gap-1.5"><FileCheck className="h-3 w-3" />DBS<StepStatusDot status={stepStatuses.dbs} /></TabsTrigger>
            <TabsTrigger value="right_to_work" className="text-xs gap-1.5"><Globe className="h-3 w-3" />Right to Work<StepStatusDot status={stepStatuses.right_to_work} /></TabsTrigger>
            <TabsTrigger value="profile" className="text-xs gap-1.5"><Briefcase className="h-3 w-3" />Profile<StepStatusDot status={stepStatuses.profile} /></TabsTrigger>
            <TabsTrigger value="competency" className="text-xs gap-1.5"><Stethoscope className="h-3 w-3" />Competency<StepStatusDot status={stepStatuses.competency} /></TabsTrigger>
            <TabsTrigger value="health" className="text-xs gap-1.5"><Heart className="h-3 w-3" />Health<StepStatusDot status={stepStatuses.health} /></TabsTrigger>
            <TabsTrigger value="references" className="text-xs gap-1.5"><Users className="h-3 w-3" />References<StepStatusDot status={stepStatuses.references} /></TabsTrigger>
            <TabsTrigger value="indemnity" className="text-xs gap-1.5"><ShieldCheck className="h-3 w-3" />Indemnity<StepStatusDot status={stepStatuses.indemnity} /></TabsTrigger>
            <TabsTrigger value="declarations" className="text-xs gap-1.5"><ClipboardCheck className="h-3 w-3" />Declarations</TabsTrigger>
          </TabsList>
          <div className="mt-6">
            <TabsContent value="identity"><IdentityTab candidate={candidate} /></TabsContent>
            <TabsContent value="nmc"><NmcTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="dbs"><DbsTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="right_to_work"><RightToWorkTab candidateId={candidateId} candidateName={candidate.fullName} /></TabsContent>
            <TabsContent value="profile"><ProfileTab candidate={candidate} candidateId={candidateId} /></TabsContent>
            <TabsContent value="competency"><CompetencyTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="health"><HealthTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="references"><ReferencesTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="indemnity"><IndemnityTab candidateId={candidateId} candidateName={candidate.fullName} /></TabsContent>
            <TabsContent value="declarations"><DeclarationsPanel candidateId={candidateId} /></TabsContent>
          </div>
        </Tabs>
        </>
      )}

      {section === "preboard" && (
        <PreboardTab candidateId={candidateId} candidate={candidate} />
      )}

      {section === "invoices" && (
        <CandidateInvoicesSection candidateId={candidateId} candidate={candidate} />
      )}

      {section === "compliance" && (
        <>
          <CqcComplianceCheck candidateId={candidateId} candidateName={candidate.fullName} />
          <TrainingChaseHistorySection candidateId={candidateId} />
          <Tabs defaultValue={initialComplianceTab}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1" data-testid="tabs-compliance">
              <TabsTrigger value="induction" className="text-xs gap-1.5"><FileText className="h-3 w-3" />Induction</TabsTrigger>
              <TabsTrigger value="training_compliance" className="text-xs gap-1.5"><BookOpen className="h-3 w-3" />Training</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs gap-1.5"><FolderOpen className="h-3 w-3" />Documents</TabsTrigger>
              <TabsTrigger value="audit" className="text-xs gap-1.5"><Clock className="h-3 w-3" />Audit</TabsTrigger>
            </TabsList>
            <div className="mt-6">
              <TabsContent value="induction"><InductionTab candidateId={candidateId} /></TabsContent>
              <TabsContent value="training_compliance"><TrainingComplianceTab candidateId={candidateId} /></TabsContent>
              <TabsContent value="documents"><DocumentsTab candidateId={candidateId} candidateName={candidate.fullName} /></TabsContent>
              <TabsContent value="audit"><AuditTimeline candidateId={candidateId} /></TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}

// Wrapper that forces a full remount on candidateId change so per-candidate
// useQuery results (documents, declarations, audit) cannot bleed across
// candidates while the new query is still loading. (Task 151.)
export default function CandidateDetail() {
  const params = useParams<{ id: string }>();
  const candidateId = params.id!;
  return <CandidateDetailInner key={candidateId} candidateId={candidateId} />;
}
