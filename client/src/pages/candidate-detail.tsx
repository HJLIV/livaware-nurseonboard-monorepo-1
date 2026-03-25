import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge, StepStatusDot } from "@/components/shared/status-badge";
import { StepProgress } from "@/components/shared/step-progress";
import { SpecialismSelector } from "@/components/specialism-selector";
import { AIMarkdown } from "@/components/ai-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ClipboardCheck, AlertCircle, Sparkles, FileDown
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
import { Pencil, Save, X } from "lucide-react";
import { ONBOARDING_STEPS, COMPETENCY_MATRIX, MANDATORY_TRAINING_MODULES, INDUCTION_POLICIES, REFERENCE_QUESTIONS } from "@shared/schema";
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

function PortalBadge() {
  return (
    <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/50">
      Portal
    </Badge>
  );
}

function IdentityTab({ candidate }: { candidate: Candidate }) {
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: candidate.fullName || "",
    email: candidate.email || "",
    phone: candidate.phone || "",
    dateOfBirth: candidate.dateOfBirth || "",
    address: candidate.address || "",
    preferredPronouns: candidate.preferredPronouns || "",
    nextOfKin: candidate.nextOfKin || "",
    passportNumber: candidate.passportNumber || "",
    nmcPin: candidate.nmcPin || "",
    dbsNumber: candidate.dbsNumber || "",
    band: candidate.band?.toString() || "",
    currentEmployer: candidate.currentEmployer || "",
    yearsQualified: candidate.yearsQualified?.toString() || "",
  });

  const startEditing = useCallback(() => {
    setForm({
      fullName: candidate.fullName || "",
      email: candidate.email || "",
      phone: candidate.phone || "",
      dateOfBirth: candidate.dateOfBirth || "",
      address: candidate.address || "",
      preferredPronouns: candidate.preferredPronouns || "",
      nextOfKin: candidate.nextOfKin || "",
      passportNumber: candidate.passportNumber || "",
      nmcPin: candidate.nmcPin || "",
      dbsNumber: candidate.dbsNumber || "",
      band: candidate.band?.toString() || "",
      currentEmployer: candidate.currentEmployer || "",
      yearsQualified: candidate.yearsQualified?.toString() || "",
    });
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
      if (form.dateOfBirth !== (candidate.dateOfBirth || "")) payload.dateOfBirth = form.dateOfBirth || null;
      if (form.address !== (candidate.address || "")) payload.address = form.address || null;
      if (form.preferredPronouns !== (candidate.preferredPronouns || "")) payload.preferredPronouns = form.preferredPronouns || null;
      if (form.nextOfKin !== (candidate.nextOfKin || "")) payload.nextOfKin = form.nextOfKin || null;
      if (form.passportNumber !== (candidate.passportNumber || "")) payload.passportNumber = form.passportNumber || null;
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
          <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-identity">
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit Details
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
            <div className="space-y-3">
              <InfoRow icon={<User className="h-4 w-4" />} label="Full Name" value={candidate.fullName} />
              <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={candidate.email} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={candidate.phone} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Date of Birth" value={candidate.dateOfBirth} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={candidate.address} />
              <InfoRow label="Preferred Pronouns" value={candidate.preferredPronouns} />
              <InfoRow label="Next of Kin" value={candidate.nextOfKin} />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Professional Details</h3>
            <div className="space-y-3">
              <InfoRow icon={<FileText className="h-4 w-4" />} label="Passport Number" value={candidate.passportNumber} />
              <InfoRow icon={<Award className="h-4 w-4" />} label="NMC PIN" value={candidate.nmcPin} />
              <InfoRow icon={<Shield className="h-4 w-4" />} label="DBS Number" value={candidate.dbsNumber} />
              <InfoRow label="Band" value={candidate.band ? `Band ${candidate.band}` : undefined} />
              <InfoRow label="Current Employer" value={candidate.currentEmployer} />
              <InfoRow label="Years Qualified" value={candidate.yearsQualified?.toString()} />
              <InfoRow label="Specialisms" value={candidate.specialisms?.join(", ")} />
            </div>
          </div>
        </div>
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
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-edit">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={form.fullName} onChange={e => updateField("fullName", e.target.value)} data-testid="input-edit-fullName" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={e => updateField("email", e.target.value)} data-testid="input-edit-email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={e => updateField("phone", e.target.value)} placeholder="e.g. 07700 900123" data-testid="input-edit-phone" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={e => updateField("dateOfBirth", e.target.value)} data-testid="input-edit-dob" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Textarea value={form.address} onChange={e => updateField("address", e.target.value)} rows={2} data-testid="input-edit-address" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Preferred Pronouns</Label>
              <Input value={form.preferredPronouns} onChange={e => updateField("preferredPronouns", e.target.value)} placeholder="e.g. she/her" data-testid="input-edit-pronouns" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Next of Kin</Label>
              <Input value={form.nextOfKin} onChange={e => updateField("nextOfKin", e.target.value)} data-testid="input-edit-nok" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Professional Details</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Passport Number</Label>
              <Input value={form.passportNumber} onChange={e => updateField("passportNumber", e.target.value)} data-testid="input-edit-passport" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">NMC PIN</Label>
              <Input value={form.nmcPin} onChange={e => updateField("nmcPin", e.target.value)} placeholder="e.g. 12A3456B" data-testid="input-edit-nmc" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">DBS Number</Label>
              <Input value={form.dbsNumber} onChange={e => updateField("dbsNumber", e.target.value)} placeholder="e.g. 001234567890" data-testid="input-edit-dbs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Band</Label>
              <Input type="number" min="1" max="9" value={form.band} onChange={e => updateField("band", e.target.value)} placeholder="e.g. 5" data-testid="input-edit-band" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Current Employer</Label>
              <Input value={form.currentEmployer} onChange={e => updateField("currentEmployer", e.target.value)} data-testid="input-edit-employer" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Years Qualified</Label>
              <Input type="number" min="0" value={form.yearsQualified} onChange={e => updateField("yearsQualified", e.target.value)} data-testid="input-edit-years" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value || "Not provided"}</p>
      </div>
    </div>
  );
}

interface NmcRawResponse {
  pdfVerification?: boolean;
  evidenceFilename?: string | null;
  extractionMethod?: "parsed" | "ai-extracted";
}

function getNmcExtractionMethod(verification: NmcVerification): string | undefined {
  const raw = verification.rawResponse as NmcRawResponse | null;
  return raw?.extractionMethod;
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
  const { toast } = useToast();

  const resolvedPin = (candidate?.nmcPin || "").trim();
  const NMC_URL = "https://www.nmc.org.uk/registration/search-the-register/";

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
      toast({ title: "Error", description: err.message || "Could not save NMC verification.", variant: "destructive" });
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  if (verification && !showRecheck && !parsedData) {
    const statusOk = verification.status === "verified";
    return (
      <div className="space-y-4" data-testid="tab-nmc">
        <div className="flex items-center gap-2">
          <StatusBadge status={statusOk ? "cleared" : "escalated"} />
          <span className="text-sm text-muted-foreground">
            {verification.verifiedAt ? `Verified ${new Date(verification.verifiedAt).toLocaleDateString("en-GB")}` : ""}
          </span>
          {getNmcExtractionMethod(verification) === "ai-extracted" && (
            <Badge variant="outline" className="text-[10px] bg-purple-950/60 text-purple-300 border-purple-800/50" data-testid="badge-ai-extracted-verified">
              <Sparkles className="h-3 w-3 mr-1" />
              AI-extracted
            </Badge>
          )}
        </div>
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
        >
          <Stethoscope className="h-4 w-4 mr-2" />
          Re-verify Registration
        </Button>
      </div>
    );
  }

  if (parsedData) {
    const statusLower = (parsedData.registrationStatus || "").toLowerCase();
    const isRegistered = statusLower.includes("registered") && !statusLower.includes("condition") && !statusLower.includes("caution") && !statusLower.includes("suspend");
    return (
      <div className="space-y-4" data-testid="tab-nmc">
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 p-4 space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-blue-400" />
            <p className="text-sm font-medium">PDF Parsed — Review Details</p>
            {parsedData.extractionMethod === "ai-extracted" && (
              <Badge variant="outline" className="text-[10px] bg-purple-950/60 text-purple-300 border-purple-800/50" data-testid="badge-ai-extracted">
                <Sparkles className="h-3 w-3 mr-1" />
                AI-extracted
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {parsedData.extractionMethod === "ai-extracted"
              ? "Standard parsing returned incomplete results. These details were extracted using AI. Please review carefully and confirm."
              : "These details were extracted from the uploaded NMC register PDF. Please review and confirm."}
          </p>
        </div>

        <div className={`rounded-lg border p-4 space-y-3 ${isRegistered ? "border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20"}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isRegistered ? "bg-green-500" : "bg-amber-500"}`} />
            <span className="text-sm font-semibold">{parsedData.registrationStatus || "Unknown Status"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {parsedData.pin && (
              <div>
                <span className="text-muted-foreground text-xs">NMC PIN</span>
                <p className="font-medium" data-testid="text-parsed-pin">{parsedData.pin}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground text-xs">Registered Name</span>
              <p className="font-medium" data-testid="text-parsed-name">{parsedData.registeredName || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Location</span>
              <p className="font-medium">{parsedData.location || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Field of Practice</span>
              <p className="font-medium" data-testid="text-parsed-field">{parsedData.fieldOfPractice || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Renewal Date</span>
              <p className="font-medium" data-testid="text-parsed-renewal">{parsedData.renewalDate || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Effective Date</span>
              <p className="font-medium" data-testid="text-parsed-effective">{parsedData.effectiveDate || "—"}</p>
            </div>
          </div>
          {parsedData.conditions?.length > 0 && (
            <div className="rounded-md border border-orange-800/50 bg-orange-950/30 p-2">
              <p className="text-xs font-medium text-orange-300">Conditions/Cautions detected:</p>
              <ul className="mt-1 text-xs text-orange-400">
                {parsedData.conditions.map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => confirmMutation.mutate({
              pin: parsedData.pin || resolvedPin || "",
              registeredName: parsedData.registeredName,
              registrationStatus: parsedData.registrationStatus,
              fieldOfPractice: parsedData.fieldOfPractice,
              effectiveDate: parsedData.effectiveDate,
              renewalDate: parsedData.renewalDate,
              conditions: parsedData.conditions || [],
              uploadedFilename: parsedData.uploadedFilename,
              originalFilename: parsedData.originalFilename,
              extractionMethod: parsedData.extractionMethod || "parsed",
            })}
            disabled={confirmMutation.isPending || !parsedData.registrationStatus}
            data-testid="button-confirm-nmc"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {confirmMutation.isPending ? "Confirming..." : "Confirm & Save Verification"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setParsedData(null)}
            data-testid="button-cancel-nmc"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="tab-nmc">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 p-4 space-y-3">
        <p className="text-sm font-medium">NMC Register Verification</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">1</span>
            Search the NMC register for the candidate's PIN
            {resolvedPin && <Badge variant="outline" className="ml-1 text-[10px]">{resolvedPin}</Badge>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">2</span>
            Download the registration page as PDF
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-900/50 text-blue-300 text-[10px] font-bold">3</span>
            Upload the PDF below — details will be extracted automatically
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(NMC_URL, "_blank")}
          data-testid="button-open-nmc-register"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open NMC Register
        </Button>
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
  const { data: verification, isLoading } = useQuery<DbsVerification | null>({
    queryKey: ["/api/candidates", candidateId, "dbs-verification"],
  });
  const { data: candidate } = useQuery<Candidate>({
    queryKey: ["/api/candidates", candidateId],
  });
  const { data: dbsStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/dbs/status"],
  });
  const [certNum, setCertNum] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [certType, setCertType] = useState("Enhanced with Barred List");
  const [updateService, setUpdateService] = useState(false);
  const [surname, setSurname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [liveResult, setLiveResult] = useState<any>(null);
  const { toast } = useToast();

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
        <div className="flex items-center gap-2">
          <StatusBadge status={verification.status === "verified" ? "cleared" : "escalated"} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Certificate Number" value={verification.certificateNumber} />
          <InfoRow label="Issue Date" value={verification.issueDate} />
          <InfoRow label="Certificate Type" value={verification.certificateType} />
          <InfoRow label="Update Service" value={verification.updateServiceSubscribed ? "Subscribed" : "Not subscribed"} />
          <InfoRow label="Check Result" value={verification.checkResult} />
        </div>
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
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            DBS Update Service
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(DBS_URL, "_blank")}
            data-testid="button-open-dbs-info"
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
          <Button onClick={() => verifyMutation.mutate()} disabled={!certNum || verifyMutation.isPending} data-testid="button-verify-dbs">
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

function RightToWorkTab({ candidateId }: { candidateId: string }) {
  const { data: docs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/candidates", candidateId, "documents"],
  });
  const [docType, setDocType] = useState("Passport");
  const [filename, setFilename] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/documents`, {
        type: docType,
        filename: filename || `${docType.toLowerCase().replace(/\s/g, "_")}_scan.pdf`,
        category: "right_to_work",
        expiryDate: expiryDate || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      setFilename("");
      setExpiryDate("");
      toast({ title: "Document recorded" });
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  const rtwDocs = (docs || []).filter((d: any) => d.category === "right_to_work");

  return (
    <div className="space-y-6" data-testid="tab-right-to-work">
      {rtwDocs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Uploaded Documents</h4>
          {rtwDocs.map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between rounded-lg border border-card-border p-3" data-testid={`doc-rtw-${doc.id}`}>
              <div className="flex items-center gap-3">
                <FileCheck className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">{doc.type}</p>
                  {doc.filePath ? (
                    <DocumentLink doc={doc} />
                  ) : (
                    <p className="text-xs text-muted-foreground">{doc.filename}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {doc.uploadedBy === "nurse" && <PortalBadge />}
                {doc.expiryDate && (
                  <Badge variant="outline" className="text-xs">Expires: {doc.expiryDate}</Badge>
                )}
                {doc.filePath && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <a href={doc.filePath} target="_blank" rel="noopener noreferrer" data-testid={`button-view-rtw-${doc.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Card className="border border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Record Right to Work Document</CardTitle>
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
            <Label>Document Reference / Filename</Label>
            <Input value={filename} onChange={e => setFilename(e.target.value)} placeholder="e.g. passport_scan.pdf" data-testid="input-rtw-filename" />
          </div>
          <div className="space-y-2">
            <Label>Expiry Date</Label>
            <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} data-testid="input-rtw-expiry" />
          </div>
          <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending} data-testid="button-record-rtw">
            {uploadMutation.isPending ? "Recording..." : "Record Document"}
          </Button>
        </CardContent>
      </Card>
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
  const { toast } = useToast();

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
      toast({ title: "Profile updated" });
    },
  });

  return (
    <div className="space-y-6" data-testid="tab-profile">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Employment Details</h3>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Current Employer</Label>
              <Input value={employer} onChange={e => setEmployer(e.target.value)} placeholder="e.g. Royal Marsden NHS Trust" data-testid="input-employer" />
            </div>
            <div className="space-y-2">
              <Label>Years Qualified</Label>
              <Input type="number" value={yearsQualified} onChange={e => setYearsQualified(e.target.value)} placeholder="e.g. 5" data-testid="input-years-qualified" />
            </div>
            <div className="space-y-2">
              <Label>Clinical Specialisms</Label>
              <SpecialismSelector selected={specialisms} onChange={setSpecialisms} testIdPrefix="admin-specialism" />
            </div>
            <div className="space-y-2">
              <Label>Band</Label>
              <Input value={candidate.band?.toString() || ""} disabled className="bg-muted" />
            </div>
          </div>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-update-profile">
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

function TrainingTab({ candidateId }: { candidateId: string }) {
  const { data: training, isLoading } = useQuery<MandatoryTraining[]>({
    queryKey: ["/api/candidates", candidateId, "mandatory-training"],
  });
  const { data: docs } = useQuery<any[]>({
    queryKey: ["/api/candidates", candidateId, "documents"],
  });
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
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "documents"] });
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
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild disabled={certUploading}>
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
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addMutation.mutate(mod)} disabled={addMutation.isPending}>
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
    </div>
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
        <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} data-testid="button-submit-health">
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
                    {ref.formSubmittedAt && (
                      <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Form submitted {new Date(ref.formSubmittedAt).toLocaleDateString("en-GB")}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={outcomeConfig[ref.outcome]?.color || ""}>
                    {outcomeConfig[ref.outcome]?.label || ref.outcome}
                  </Badge>
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
          <Button onClick={() => draftMutation.mutate()} disabled={!name || !email || draftMutation.isPending} data-testid="button-draft-reference">
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

function InductionTab({ candidateId }: { candidateId: string }) {
  const { data: policies, isLoading } = useQuery<InductionPolicy[]>({
    queryKey: ["/api/candidates", candidateId, "induction-policies"],
  });
  const { toast } = useToast();

  const acknowledgeMutation = useMutation({
    mutationFn: async (policyName: string) => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/induction-policies`, {
        policyName,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "induction-policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({ title: "Policy acknowledged" });
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  const acknowledgedNames = new Set((policies || []).filter(p => p.acknowledged).map(p => p.policyName));

  return (
    <div className="space-y-4" data-testid="tab-induction">
      <p className="text-sm text-muted-foreground">
        {acknowledgedNames.size} of {INDUCTION_POLICIES.length} policies acknowledged
      </p>
      <div className="space-y-2">
        {INDUCTION_POLICIES.map(policy => (
          <div key={policy} className="flex items-center justify-between rounded-lg border border-card-border p-3">
            <div className="flex items-center gap-3">
              {acknowledgedNames.has(policy) ? (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
              )}
              <span className="text-sm font-medium text-foreground">{policy}</span>
            </div>
            {!acknowledgedNames.has(policy) && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => acknowledgeMutation.mutate(policy)} disabled={acknowledgeMutation.isPending}>
                Acknowledge
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function IndemnityTab({ candidateId }: { candidateId: string }) {
  const { data: indemnity, isLoading } = useQuery<ProfessionalIndemnity | null>({
    queryKey: ["/api/candidates", candidateId, "professional-indemnity"],
  });
  const { data: docs } = useQuery<any[]>({
    queryKey: ["/api/candidates", candidateId, "documents"],
  });
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
                  <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-card-border p-3">
                    <FileCheck className="h-4 w-4 text-emerald-500" />
                    <DocumentLink doc={doc} />
                    {doc.uploadedBy === "nurse" && <PortalBadge />}
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
        <Button onClick={() => submitMutation.mutate()} disabled={!provider || submitMutation.isPending} data-testid="button-submit-indemnity">
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

function DocumentAiIssues({ issues, status }: { issues?: string[] | null; status?: string | null }) {
  if (!issues || !Array.isArray(issues) || issues.length === 0) return null;
  if (!status || status === "pass") return null;

  const borderColor = status === "fail" ? "border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20" : "border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20";
  const textColor = status === "fail" ? "text-red-300" : "text-amber-300";

  return (
    <div className={`mx-3 mb-1 mt-1 rounded-md border p-2 ${borderColor}`} data-testid="ai-issues-list">
      <ul className={`text-xs space-y-1 ${textColor}`}>
        {issues.map((issue, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{issue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentsTab({ candidateId }: { candidateId: string }) {
  const { data: docs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/candidates", candidateId, "documents"],
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      if (data?.some((d: any) => d.aiStatus === "pending")) return 5000;
      return false;
    },
  });
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [lastClassification, setLastClassification] = useState<{
    detectedCategory: string;
    detectedType: string;
    matchedTrainingModules: string[];
    autoRecorded: string[];
    confidence: string;
    summary: string;
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
      });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "mandatory-training"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "onboarding-state"] });
      toast({
        title: "Document Uploaded & Classified",
        description: `Identified as: ${result.classification.detectedType}${result.autoRecorded.length > 0 ? ` — ${result.autoRecorded.length} training module(s) auto-recorded` : ""}`,
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
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild disabled={uploading}>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild data-testid={`btn-sharepoint-${doc.id}`}>
                      <a href={doc.sharepointUrl} target="_blank" rel="noopener noreferrer" title="Open in SharePoint">
                        <Globe className="h-3.5 w-3.5 text-blue-400" />
                      </a>
                    </Button>
                  )}
                  {doc.filePath && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a href={doc.filePath} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              <DocumentAiIssues issues={doc.aiIssues} status={doc.aiStatus} />
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
              <Button variant="ghost" size="sm" onClick={handleCopy} data-testid="button-copy-summary">
                {copied ? <><CheckCircle className="h-3.5 w-3.5 mr-1" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setSummary(null); }} data-testid="button-clear-summary">
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

export default function CandidateDetail() {
  const params = useParams<{ id: string }>();
  const candidateId = params.id!;
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
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground" data-testid="text-candidate-name">{candidate.fullName}</h1>
                <StatusBadge status={candidate.currentStage} isStage />
                <StatusBadge status={candidate.status} />
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                {candidate.band && <span>Band {candidate.band}</span>}
                {candidate.nmcPin && <span>NMC: {candidate.nmcPin}</span>}
                {candidate.specialisms && <span>{candidate.specialisms.join(", ")}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="button-download-pdf"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = `/api/candidates/${candidateId}/pdf-report`;
                  a.download = "";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                <FileDown className="h-4 w-4 mr-1.5" />
                Download PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => generateLinkMutation.mutate()}
                disabled={generateLinkMutation.isPending}
                size="sm"
                data-testid="button-generate-portal-link"
              >
                <Mail className="h-4 w-4 mr-1.5" />
                {generateLinkMutation.isPending ? "Sending..." : "Send Portal Invite"}
              </Button>
            </div>
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

function CqcComplianceCheck({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/candidates/${candidateId}/compliance-check`);
      return res.json();
    },
    onSuccess: (data: { result: string }) => {
      setResult(data.result);
      setGeneratedAt(new Date().toLocaleString("en-GB"));
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "audit-log"] });
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
            <AIMarkdown content={result} className="text-sm" data-testid="compliance-check-markdown" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTabs({ candidateId, candidate, stepStatuses, currentStep }: { candidateId: string; candidate: Candidate; stepStatuses: Record<string, string>; currentStep: number }) {
  const [section, setSection] = useState<"onboarding" | "compliance">("onboarding");

  return (
    <div className="space-y-4">
      <div className="flex gap-2" data-testid="section-toggle">
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
        <Tabs defaultValue="identity">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1" data-testid="tabs-onboarding">
            <TabsTrigger value="identity" className="text-xs gap-1.5"><User className="h-3 w-3" />Identity</TabsTrigger>
            <TabsTrigger value="nmc" className="text-xs gap-1.5"><Shield className="h-3 w-3" />NMC</TabsTrigger>
            <TabsTrigger value="dbs" className="text-xs gap-1.5"><FileCheck className="h-3 w-3" />DBS</TabsTrigger>
            <TabsTrigger value="right_to_work" className="text-xs gap-1.5"><Globe className="h-3 w-3" />Right to Work</TabsTrigger>
            <TabsTrigger value="profile" className="text-xs gap-1.5"><Briefcase className="h-3 w-3" />Profile</TabsTrigger>
            <TabsTrigger value="competency" className="text-xs gap-1.5"><Stethoscope className="h-3 w-3" />Competency</TabsTrigger>
            <TabsTrigger value="health" className="text-xs gap-1.5"><Heart className="h-3 w-3" />Health</TabsTrigger>
            <TabsTrigger value="references" className="text-xs gap-1.5"><Users className="h-3 w-3" />References</TabsTrigger>
            <TabsTrigger value="indemnity" className="text-xs gap-1.5"><ShieldCheck className="h-3 w-3" />Indemnity</TabsTrigger>
          </TabsList>
          <div className="mt-6">
            <TabsContent value="identity"><IdentityTab candidate={candidate} /></TabsContent>
            <TabsContent value="nmc"><NmcTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="dbs"><DbsTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="right_to_work"><RightToWorkTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="profile"><ProfileTab candidate={candidate} candidateId={candidateId} /></TabsContent>
            <TabsContent value="competency"><CompetencyTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="health"><HealthTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="references"><ReferencesTab candidateId={candidateId} /></TabsContent>
            <TabsContent value="indemnity"><IndemnityTab candidateId={candidateId} /></TabsContent>
          </div>
        </Tabs>
        </>
      )}

      {section === "compliance" && (
        <>
          <CqcComplianceCheck candidateId={candidateId} candidateName={candidate.fullName} />
          <Tabs defaultValue="induction">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1" data-testid="tabs-compliance">
              <TabsTrigger value="induction" className="text-xs gap-1.5"><FileText className="h-3 w-3" />Induction</TabsTrigger>
              <TabsTrigger value="training_compliance" className="text-xs gap-1.5"><BookOpen className="h-3 w-3" />Training</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs gap-1.5"><FolderOpen className="h-3 w-3" />Documents</TabsTrigger>
              <TabsTrigger value="audit" className="text-xs gap-1.5"><Clock className="h-3 w-3" />Audit</TabsTrigger>
            </TabsList>
            <div className="mt-6">
              <TabsContent value="induction"><InductionTab candidateId={candidateId} /></TabsContent>
              <TabsContent value="training_compliance"><TrainingComplianceTab candidateId={candidateId} /></TabsContent>
              <TabsContent value="documents"><DocumentsTab candidateId={candidateId} /></TabsContent>
              <TabsContent value="audit"><AuditTimeline candidateId={candidateId} /></TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}
