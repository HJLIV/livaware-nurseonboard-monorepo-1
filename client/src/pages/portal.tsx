import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PortalLayout } from "@/components/layout/portal-layout";
import { FileUpload } from "@/components/shared/file-upload";
import { SpecialismSelector } from "@/components/specialism-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, AlertCircle, Loader2, User, Shield, FileCheck,
  Stethoscope, BookOpen, Heart, Users, FileText, ShieldCheck,
  Award, Upload, Plus, Trash2, Info, ExternalLink, Briefcase, Lightbulb, Equal,
  Lock as LockIcon, Unlock
} from "lucide-react";
import {
  PORTAL_STEPS, COMPETENCY_MATRIX, MANDATORY_TRAINING_MODULES
} from "@shared/schema";
import { ChatWidget } from "@/components/portal/chat-widget";
import type {
  Candidate, OnboardingState, CompetencyDeclaration,
  MandatoryTraining, HealthDeclaration,
  ProfessionalIndemnity, Reference
} from "@shared/schema";

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

function DocumentAiAlert({ docs, category }: { docs?: any[]; category: string }) {
  if (!docs) return null;
  const flaggedDocs = docs.filter((d: any) => d.category === category && (d.aiStatus === "warning" || d.aiStatus === "fail") && Array.isArray(d.aiIssues) && d.aiIssues.length > 0);
  if (flaggedDocs.length === 0) return null;

  return (
    <div className="space-y-2" data-testid={`ai-alert-${category}`}>
      {flaggedDocs.map((doc: any) => (
        <div key={doc.id} className={`rounded-md border p-3 text-sm ${doc.aiStatus === "fail" ? "border-red-800/50 bg-red-950/30 text-red-300" : "border-amber-800/50 bg-amber-950/30 text-amber-300"}`}>
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">
                {doc.aiStatus === "fail" ? "Issues found" : "Review needed"} — {doc.originalFilename || doc.filename}
              </p>
              <ul className="text-xs space-y-0.5 list-disc list-inside">
                {(doc.aiIssues as string[]).map((issue: string, i: number) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-1">
                Please check and re-upload if needed. Your document has still been saved.
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionWrapper({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  status?: string;
  children: React.ReactNode;
}) {
  const isComplete = status === "completed";
  const isInProgress = status === "in_progress";

  return (
    <Card data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 text-muted-foreground">{icon}</div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {isComplete && (
          <Badge variant="outline" className="shrink-0 bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
            <CheckCircle className="h-3 w-3 mr-1" /> Complete
          </Badge>
        )}
        {isInProgress && (
          <Badge variant="outline" className="shrink-0">In Progress</Badge>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PassportUpload({ token, existingPassportNumber }: { token: string; existingPassportNumber?: string | null }) {
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [passportNumber, setPassportNumber] = useState(existingPassportNumber || "");
  const { toast } = useToast();

  const handlePassportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setParseResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/portal/${token}/passport-parse`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      const result = await res.json();
      setParseResult(result);
      if (result.passportNumber) {
        setPassportNumber(result.passportNumber);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "documents"] });
      toast({ title: "Passport uploaded", description: result.mrzDetected ? "Passport details extracted successfully" : "Passport saved — please enter your passport number manually below" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Could not process passport image", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const savePassportNumber = async () => {
    if (!passportNumber.trim()) return;
    try {
      await apiRequest("PATCH", `/api/portal/${token}/candidate`, { passportNumber: passportNumber.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "candidate"] });
      toast({ title: "Passport number saved" });
    } catch {
      toast({ title: "Failed to save passport number", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Passport Photo Page (required)</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a clear scan or photo of your passport photo page. The system will attempt to read and extract your passport number automatically.
        </p>
      </div>

      {existingPassportNumber && !parseResult && (
        <div className="rounded-md border border-emerald-800/50 bg-emerald-950/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-emerald-300">Passport already uploaded — Number: {existingPassportNumber}</span>
          </div>
        </div>
      )}

      <label className="cursor-pointer">
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePassportUpload} disabled={uploading} data-testid="input-passport-upload" />
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild disabled={uploading}>
          <span>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Processing..." : existingPassportNumber ? "Re-upload Passport" : "Upload Passport Photo Page"}
          </span>
        </Button>
      </label>

      {parseResult && (
        <div className={`rounded-md border p-3 text-sm ${parseResult.mrzDetected ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300" : "border-amber-800/50 bg-amber-950/30 text-amber-300"}`}>
          <div className="flex items-start gap-2">
            {parseResult.mrzDetected ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="space-y-1">
              <p className="font-medium">{parseResult.mrzDetected ? "Passport Details Extracted" : "Passport Uploaded — Manual Entry Needed"}</p>
              {parseResult.mrzDetected && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                  <span className="text-muted-foreground">Passport No:</span>
                  <span>{parseResult.passportNumber || "—"}</span>
                  <span className="text-muted-foreground">Surname:</span>
                  <span>{parseResult.surname || "—"}</span>
                  <span className="text-muted-foreground">Given Names:</span>
                  <span>{parseResult.givenNames || "—"}</span>
                  <span className="text-muted-foreground">Nationality:</span>
                  <span>{parseResult.nationality || "—"}</span>
                  <span className="text-muted-foreground">Date of Birth:</span>
                  <span>{parseResult.dateOfBirth || "—"}</span>
                  <span className="text-muted-foreground">Expiry:</span>
                  <span>{parseResult.expiryDate || "—"}</span>
                </div>
              )}
              {!parseResult.mrzDetected && parseResult.passportNumber && (
                <p className="text-xs mt-1">We found a possible passport number but couldn't fully read the machine-readable zone. Please verify the number below is correct.</p>
              )}
              {!parseResult.mrzDetected && !parseResult.passportNumber && (
                <p className="text-xs mt-1">We couldn't automatically read the passport details. Please enter your passport number manually below. For best results, ensure the photo is well-lit, flat, and shows the full machine-readable zone at the bottom of the page.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-sm">
        <div className="flex-1 space-y-2">
          <Label className="text-xs">Passport Number</Label>
          <Input
            value={passportNumber}
            onChange={e => setPassportNumber(e.target.value)}
            placeholder="e.g. 533401254"
            data-testid="input-passport-number"
          />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={savePassportNumber} disabled={!passportNumber.trim()} data-testid="button-save-passport-number">
          Save
        </Button>
      </div>
    </div>
  );
}

function PortalLockedInput({ label, value, onChange, locked, onUnlock, type, placeholder, rows, testId }: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  locked: boolean;
  onUnlock: () => void;
  type?: string;
  placeholder?: string;
  rows?: number;
  testId?: string;
}) {
  if (locked) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-950/10 text-sm">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">{value}</span>
            <LockIcon className="h-3 w-3 text-emerald-500/60 shrink-0 ml-auto" />
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-400" onClick={onUnlock} data-testid={testId ? `${testId}-unlock` : undefined}>
            <Unlock className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {rows ? (
        <Textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} data-testid={testId} />
      ) : (
        <Input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} />
      )}
    </div>
  );
}

function PortalProofOfAddress({ token }: { token: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [documentDate, setDocumentDate] = useState("");

  const { data: docs = [] } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "documents"],
  });
  const poaDocs = docs.filter((d: any) => d.category === "proof_of_address");

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!documentDate) throw new Error("Please select the document date first");
      const docDate = new Date(documentDate);
      const today = new Date();
      if (docDate > today) throw new Error("Document date cannot be in the future");
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      if (docDate < threeMonthsAgo) throw new Error("Document must be dated within the last 3 months");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentDate", documentDate);
      const res = await fetch(`/api/portal/${token}/proof-of-address`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      setDocumentDate("");
      toast({ title: "Proof of address uploaded" });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (e.target) e.target.value = "";
  };

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return true;
    const d = new Date(expiryDate);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return d < threeMonthsAgo;
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Proof of Address (required)</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a recent document (dated within the last 3 months) showing your current address. Accepted documents: utility bill, bank statement, council tax bill, or tenancy agreement.
        </p>
      </div>

      {poaDocs.length > 0 && (
        <div className="space-y-2">
          {poaDocs.map((doc: any) => {
            const expired = isExpired(doc.expiryDate);
            return (
              <div key={doc.id} className={`flex items-center gap-2 rounded-md border p-2 text-sm ${expired ? "border-red-800/30 bg-red-950/10" : "border-emerald-800/30 bg-emerald-950/10"}`}>
                {expired ? <AlertCircle className="h-4 w-4 text-red-400 shrink-0" /> : <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
                <span className="truncate flex-1">{doc.originalFilename || doc.filename}</span>
                {doc.expiryDate && (
                  <span className={`text-xs shrink-0 ${expired ? "text-red-400" : "text-emerald-400"}`}>
                    {new Date(doc.expiryDate).toLocaleDateString("en-GB")}
                    {expired && " — expired"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 items-end max-w-sm">
        <div className="flex-1">
          <Label className="text-xs">Document Date</Label>
          <Input
            type="date"
            value={documentDate}
            onChange={(e) => setDocumentDate(e.target.value)}
            className="h-9 text-sm"
            max={new Date().toISOString().split("T")[0]}
            data-testid="input-portal-poa-date"
          />
        </div>
        <Button
          size="sm"
          className="h-9 text-sm gap-1.5"
          onClick={() => fileRef.current?.click()}
          disabled={!documentDate || uploadMutation.isPending}
          data-testid="button-portal-poa-upload"
        >
          {uploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload Proof
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleFile} />
    </div>
  );
}

function IdentityStep({ token, candidate, status }: { token: string; candidate: Candidate; status?: string }) {
  const { data: identityDocs } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "documents"],
  });
  const [fullName, setFullName] = useState(candidate.fullName || "");
  const [email, setEmail] = useState(candidate.email || "");
  const [phone, setPhone] = useState(candidate.phone || "");
  const [dateOfBirth, setDateOfBirth] = useState(candidate.dateOfBirth || "");
  const [address, setAddress] = useState(candidate.address || "");
  const [pronouns, setPronouns] = useState(candidate.preferredPronouns || "");
  const [nokName, setNokName] = useState(parseNextOfKin(candidate.nextOfKin).name);
  const [nokRelationship, setNokRelationship] = useState(parseNextOfKin(candidate.nextOfKin).relationship);
  const [nokContact, setNokContact] = useState(parseNextOfKin(candidate.nextOfKin).contactNumber);
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const isLocked = (field: string, originalValue: string | null | undefined) => {
    const val = originalValue ?? "";
    return val !== "" && !unlockedFields.has(field);
  };
  const unlock = (field: string) => setUnlockedFields(prev => new Set(prev).add(field));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/portal/${token}/candidate`, {
        fullName, email, phone, dateOfBirth, address,
        preferredPronouns: pronouns, nextOfKin: serializeNextOfKin(nokName, nokRelationship, nokContact) || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      setUnlockedFields(new Set());
      toast({ title: "Identity saved", description: "Your identity details have been updated." });
    },
  });

  return (
    <SectionWrapper title="Identity & Contact" icon={<User className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PortalLockedInput label="Full Name" value={fullName} onChange={setFullName} locked={isLocked("fullName", candidate.fullName)} onUnlock={() => unlock("fullName")} testId="input-portal-fullname" />
          <PortalLockedInput label="Email" value={email} onChange={setEmail} locked={isLocked("email", candidate.email)} onUnlock={() => unlock("email")} type="email" testId="input-portal-email" />
          <PortalLockedInput label="Phone" value={phone} onChange={setPhone} locked={isLocked("phone", candidate.phone)} onUnlock={() => unlock("phone")} testId="input-portal-phone" />
          <PortalLockedInput label="Date of Birth" value={dateOfBirth} onChange={setDateOfBirth} locked={isLocked("dateOfBirth", candidate.dateOfBirth)} onUnlock={() => unlock("dateOfBirth")} type="date" testId="input-portal-dob" />
          <div className="sm:col-span-2">
            <PortalLockedInput label="Address" value={address} onChange={setAddress} locked={isLocked("address", candidate.address)} onUnlock={() => unlock("address")} rows={2} testId="input-portal-address" />
          </div>
          <div className="space-y-2">
            <Label>Preferred Pronouns</Label>
            {isLocked("pronouns", candidate.preferredPronouns) ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-950/10 text-sm">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">{pronouns}</span>
                  <LockIcon className="h-3 w-3 text-emerald-500/60 shrink-0 ml-auto" />
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-400" onClick={() => unlock("pronouns")}>
                  <Unlock className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>
            ) : (
              <Select value={pronouns} onValueChange={setPronouns}>
                <SelectTrigger data-testid="select-portal-pronouns">
                  <SelectValue placeholder="Select pronouns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="she/her">She/Her</SelectItem>
                  <SelectItem value="he/him">He/Him</SelectItem>
                  <SelectItem value="they/them">They/Them</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <PortalLockedInput label="Next of Kin — Name" value={nokName} onChange={setNokName} locked={isLocked("nokName", parseNextOfKin(candidate.nextOfKin).name)} onUnlock={() => unlock("nokName")} placeholder="e.g. Jane Smith" testId="input-portal-nok-name" />
          <PortalLockedInput label="Next of Kin — Relationship" value={nokRelationship} onChange={setNokRelationship} locked={isLocked("nokRelationship", parseNextOfKin(candidate.nextOfKin).relationship)} onUnlock={() => unlock("nokRelationship")} placeholder="e.g. Spouse, Parent, Sibling" testId="input-portal-nok-relationship" />
          <PortalLockedInput label="Next of Kin — Contact Number" value={nokContact} onChange={setNokContact} locked={isLocked("nokContact", parseNextOfKin(candidate.nextOfKin).contactNumber)} onUnlock={() => unlock("nokContact")} placeholder="e.g. 07700 900456" testId="input-portal-nok-contact" />
        </div>

        <Separator />

        <PassportUpload token={token} existingPassportNumber={candidate.passportNumber} />

        <PortalProofOfAddress token={token} />

        <DocumentAiAlert docs={identityDocs} category="proof_of_address" />

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-identity">
          {saveMutation.isPending ? "Saving..." : "Save Identity Details"}
        </Button>
      </div>
    </SectionWrapper>
  );
}

function NmcStep({ token, candidate, status }: { token: string; candidate: Candidate; status?: string }) {
  const [pin, setPin] = useState(candidate.nmcPin || "");
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [nmcParseResult, setNmcParseResult] = useState<any>(null);
  const { toast } = useToast();
  const isPinLocked = !!(candidate.nmcPin) && !pinUnlocked;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/portal/${token}/candidate`, { nmcPin: pin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({ title: "NMC PIN saved" });
    },
  });

  const handleNmcPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/portal/${token}/nmc-parse-pdf`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const result = await res.json();
      setNmcParseResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "candidate"] });
      toast({ title: "NMC register PDF uploaded and parsed" });
    } catch {
      toast({ title: "Upload failed", description: "Could not process the NMC register PDF", variant: "destructive" });
    } finally {
      setPdfUploading(false);
      e.target.value = "";
    }
  };

  const statusColour = nmcParseResult?.registrationStatus?.toLowerCase() === "registered"
    ? "text-emerald-400 border-emerald-800/50 bg-emerald-950/30"
    : nmcParseResult?.registrationStatus
      ? "text-amber-400 border-amber-800/50 bg-amber-950/30"
      : "";

  return (
    <SectionWrapper title="NMC PIN Verification" icon={<Shield className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter your NMC PIN number and upload your NMC register PDF for verification. The admin team will review and confirm.
        </p>
        <div className="max-w-sm">
          {isPinLocked ? (
            <div className="space-y-2">
              <Label>NMC PIN</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-950/10 text-sm">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>{pin}</span>
                  <LockIcon className="h-3 w-3 text-emerald-500/60 shrink-0 ml-auto" />
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-400" onClick={() => setPinUnlocked(true)}>
                  <Unlock className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>NMC PIN</Label>
              <Input value={pin} onChange={e => setPin(e.target.value)} placeholder="e.g. 18A1234C" data-testid="input-portal-nmc-pin" />
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">NMC Register PDF</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Download your NMC register page as a PDF from the NMC website, then upload it here. The system will extract your registration details for admin review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="https://www.nmc.org.uk/registration/search-the-register/" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild data-testid="link-nmc-register-search">
                <span>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Search NMC Register
                </span>
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Search for your name on the NMC register, then use your browser's print function to save the page as a PDF. Upload that PDF below.
          </p>
          <label className="cursor-pointer">
            <input type="file" accept=".pdf" className="hidden" onChange={handleNmcPdfUpload} disabled={pdfUploading} data-testid="input-portal-nmc-pdf" />
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild disabled={pdfUploading}>
              <span>
                {pdfUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {pdfUploading ? "Processing..." : "Upload NMC Register PDF"}
              </span>
            </Button>
          </label>

          {nmcParseResult && (
            <div className={`rounded-md border p-3 text-sm ${statusColour}`}>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">Registration Details Extracted</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                    <span className="text-muted-foreground">Name:</span>
                    <span>{nmcParseResult.registeredName || "—"}</span>
                    <span className="text-muted-foreground">Status:</span>
                    <span className="font-medium">{nmcParseResult.registrationStatus || "—"}</span>
                    <span className="text-muted-foreground">Field:</span>
                    <span>{nmcParseResult.fieldOfPractice || "—"}</span>
                    <span className="text-muted-foreground">Renewal:</span>
                    <span>{nmcParseResult.renewalDate || "—"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    The admin team will review and confirm these details.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator />
        <div className="space-y-2">
          <Label>NMC Registration Letter (optional)</Label>
          <FileUpload
            uploadUrl={`/api/portal/${token}/upload`}
            onUploadComplete={(file) => {
              apiRequest("POST", `/api/portal/${token}/documents`, {
                type: "NMC Registration Letter",
                filename: file.filename,
                originalFilename: file.originalFilename,
                filePath: file.filePath,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                category: "nmc",
              });
            }}
          />
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={!pin || saveMutation.isPending} data-testid="button-save-nmc">
          {saveMutation.isPending ? "Saving..." : "Save NMC PIN"}
        </Button>
      </div>
    </SectionWrapper>
  );
}

function DbsStep({ token, candidate, status }: { token: string; candidate: Candidate; status?: string }) {
  const { data: existingVerification } = useQuery<any>({
    queryKey: ["/api/portal", token, "dbs-verification"],
  });
  const { data: dbsDocs } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "documents"],
  });
  const [certNumber, setCertNumber] = useState(candidate.dbsNumber || "");
  const [certUnlocked, setCertUnlocked] = useState(false);
  const isCertLocked = !!(candidate.dbsNumber) && !certUnlocked;
  const [issueDate, setIssueDate] = useState("");
  const [certType, setCertType] = useState("Enhanced with Barred List");
  const [updateService, setUpdateService] = useState(false);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/portal/${token}/candidate`, { dbsNumber: certNumber });
      await apiRequest("POST", `/api/portal/${token}/dbs-verification`, {
        certificateNumber: certNumber,
        issueDate: issueDate || null,
        certificateType: certType,
        updateServiceSubscribed: updateService,
        status: "pending",
      });
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "dbs-verification"] });
      toast({ title: "DBS details saved", description: "Your DBS certificate details have been submitted for admin verification." });
    },
  });

  if (existingVerification) {
    return (
      <SectionWrapper title="DBS Verification" icon={<Shield className="h-5 w-5" />} status={status}>
        <div className="space-y-4">
          <div className="rounded-md border p-4 space-y-2 bg-card">
            <p className="text-sm font-medium">DBS details submitted</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Certificate: {existingVerification.certificateNumber}</p>
              {existingVerification.issueDate && <p>Issue Date: {existingVerification.issueDate}</p>}
              <p>Type: {existingVerification.certificateType || "—"}</p>
              <p>Update Service: {existingVerification.updateServiceSubscribed ? "Subscribed" : "Not subscribed"}</p>
              <p>Status: {existingVerification.status === "verified" ? "Verified" : existingVerification.status === "pending" ? "Awaiting admin review" : existingVerification.status}</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>DBS Certificate Scan Upload</Label>
            <FileUpload
              uploadUrl={`/api/portal/${token}/upload`}
              onUploadComplete={(file) => {
                apiRequest("POST", `/api/portal/${token}/documents`, {
                  type: "DBS Certificate",
                  filename: file.filename,
                  originalFilename: file.originalFilename,
                  filePath: file.filePath,
                  fileSize: file.fileSize,
                  mimeType: file.mimeType,
                  category: "dbs",
                });
              }}
            />
          </div>
          <DocumentAiAlert docs={dbsDocs} category="dbs" />
        </div>
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper title="DBS Verification" icon={<Shield className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter your DBS certificate details. If you're subscribed to the DBS Update Service, you can check your certificate status online and upload the confirmation.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a href="https://secure.crbonline.gov.uk/crsc/subscriber" target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild data-testid="link-dbs-update-service">
              <span>
                <ExternalLink className="h-3.5 w-3.5" />
                Check DBS Update Service
              </span>
            </Button>
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Log in to the DBS Update Service to check your certificate status. Save or screenshot the confirmation page and upload it below with your certificate scan.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div className="space-y-2">
            <Label>Certificate Number</Label>
            {isCertLocked ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-950/10 text-sm">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>{certNumber}</span>
                  <LockIcon className="h-3 w-3 text-emerald-500/60 shrink-0 ml-auto" />
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-400" onClick={() => setCertUnlocked(true)}>
                  <Unlock className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>
            ) : (
              <Input value={certNumber} onChange={e => setCertNumber(e.target.value)} placeholder="e.g. 001234567890" data-testid="input-portal-dbs-number" />
            )}
          </div>
          <div className="space-y-2">
            <Label>Issue Date</Label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} data-testid="input-portal-dbs-date" />
          </div>
          <div className="space-y-2">
            <Label>Certificate Type</Label>
            <Select value={certType} onValueChange={setCertType}>
              <SelectTrigger data-testid="select-portal-dbs-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Enhanced with Barred List">Enhanced with Barred List</SelectItem>
                <SelectItem value="Enhanced">Enhanced</SelectItem>
                <SelectItem value="Standard">Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={updateService} onCheckedChange={setUpdateService} data-testid="switch-portal-update-service" />
            <Label className="text-sm">DBS Update Service subscribed</Label>
          </div>
        </div>

        <Separator />
        <div className="space-y-2">
          <Label>DBS Certificate Scan Upload</Label>
          <FileUpload
            uploadUrl={`/api/portal/${token}/upload`}
            onUploadComplete={(file) => {
              apiRequest("POST", `/api/portal/${token}/documents`, {
                type: "DBS Certificate",
                filename: file.filename,
                originalFilename: file.originalFilename,
                filePath: file.filePath,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                category: "dbs",
              });
            }}
          />
        </div>

        <DocumentAiAlert docs={dbsDocs} category="dbs" />

        <Button onClick={() => saveMutation.mutate()} disabled={!certNumber || saveMutation.isPending} data-testid="button-save-dbs">
          {saveMutation.isPending ? "Saving..." : "Save DBS Details"}
        </Button>
      </div>
    </SectionWrapper>
  );
}

function RightToWorkStep({ token, status }: { token: string; status?: string }) {
  const [docType, setDocType] = useState("Passport");
  const [expiryDate, setExpiryDate] = useState("");
  const [shareCode, setShareCode] = useState("");
  const { toast } = useToast();

  const { data: docs } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "documents"],
  });
  const rtwDocs = (docs || []).filter((d: any) => d.category === "right_to_work");

  return (
    <SectionWrapper title="Right to Work" icon={<FileCheck className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload evidence of your right to work in the UK. This must be one of: UK/EU passport, biometric residence permit (BRP), visa, EU Settlement Scheme status, or birth certificate with proof of nationality.
        </p>

        {rtwDocs.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Uploaded Documents</Label>
            {rtwDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="truncate">{doc.originalFilename || doc.filename}</span>
                {doc.expiryDate && <Badge variant="outline" className="text-xs ml-auto shrink-0">Expires: {doc.expiryDate}</Badge>}
              </div>
            ))}
          </div>
        )}

        <DocumentAiAlert docs={docs} category="right_to_work" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger data-testid="select-portal-rtw-type">
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
            <Label>Expiry Date</Label>
            <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} data-testid="input-portal-rtw-expiry" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Share Code (if applicable)</Label>
            <Input value={shareCode} onChange={e => setShareCode(e.target.value)} placeholder="e.g. ABC123DEF" data-testid="input-portal-share-code" />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Upload Document</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Upload a clear scan or photo of your selected document. For passports, upload the photo page. For BRP cards, upload both front and back.
            </p>
          </div>
          <FileUpload
            uploadUrl={`/api/portal/${token}/upload`}
            onUploadComplete={(file) => {
              apiRequest("POST", `/api/portal/${token}/documents`, {
                type: docType,
                filename: file.filename,
                originalFilename: file.originalFilename,
                filePath: file.filePath,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                category: "right_to_work",
                expiryDate: expiryDate || null,
              }).then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "documents"] });
                queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
                toast({ title: "Document uploaded" });
              });
            }}
          />
        </div>
      </div>
    </SectionWrapper>
  );
}

function EmploymentHistoryForm({ token }: { token: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [employer, setEmployer] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [reasonForLeaving, setReasonForLeaving] = useState("");
  const [duties, setDuties] = useState("");

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "employment-history"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/employment-history`, {
        employer, jobTitle, department: department || null,
        startDate, endDate: isCurrent ? null : endDate || null,
        isCurrent, reasonForLeaving: isCurrent ? null : reasonForLeaving || null,
        duties: duties || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "employment-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({ title: "Employment entry added" });
      setShowForm(false);
      setEmployer(""); setJobTitle(""); setDepartment(""); setStartDate(""); setEndDate("");
      setIsCurrent(false); setReasonForLeaving(""); setDuties("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/portal/${token}/employment-history/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "employment-history"] });
      toast({ title: "Entry removed" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Work History
        </h4>
        <Badge variant="outline" className="text-xs">{entries.length} {entries.length === 1 ? "entry" : "entries"}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        List your employment history starting with the most recent. Include all nursing positions and any gaps in employment.
      </p>

      {isLoading && <Skeleton className="h-16 w-full" />}

      {entries.map((entry: any) => (
        <div key={entry.id} className="rounded-lg border border-card-border p-3 space-y-1" data-testid={`employment-entry-${entry.id}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-sm">{entry.jobTitle}</p>
              <p className="text-sm text-muted-foreground">{entry.employer}{entry.department ? ` — ${entry.department}` : ""}</p>
              <p className="text-xs text-muted-foreground">
                {entry.startDate} — {entry.isCurrent ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Current</Badge> : entry.endDate || "N/A"}
              </p>
              {entry.reasonForLeaving && <p className="text-xs text-muted-foreground mt-1">Reason for leaving: {entry.reasonForLeaving}</p>}
            </div>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
              onClick={() => deleteMutation.mutate(entry.id)}
              data-testid={`button-delete-employment-${entry.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {entry.duties && <p className="text-xs text-muted-foreground border-t border-card-border pt-1 mt-1">{entry.duties}</p>}
        </div>
      ))}

      {showForm ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3" data-testid="employment-form">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Employer *</Label>
              <Input value={employer} onChange={e => setEmployer(e.target.value)} placeholder="e.g. NHS Trust / Agency" data-testid="input-emp-employer" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Job Title *</Label>
              <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Staff Nurse" data-testid="input-emp-title" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department / Ward</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. ICU, Ward 5" data-testid="input-emp-department" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start Date *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-emp-start" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isCurrent} data-testid="input-emp-end" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={isCurrent} onCheckedChange={(v) => { setIsCurrent(v); if (v) setEndDate(""); }} data-testid="switch-emp-current" />
              <Label className="text-xs">I currently work here</Label>
            </div>
          </div>
          {!isCurrent && (
            <div className="space-y-1">
              <Label className="text-xs">Reason for Leaving</Label>
              <Input value={reasonForLeaving} onChange={e => setReasonForLeaving(e.target.value)} placeholder="e.g. Career progression, End of contract" data-testid="input-emp-reason" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Key Duties / Responsibilities</Label>
            <Textarea value={duties} onChange={e => setDuties(e.target.value)} placeholder="Briefly describe your main duties in this role..." rows={2} data-testid="input-emp-duties" />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm" onClick={() => addMutation.mutate()}
              disabled={!employer || !jobTitle || !startDate || addMutation.isPending}
              data-testid="button-save-employment"
            >
              {addMutation.isPending ? "Saving..." : "Add Entry"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-employment">Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} data-testid="button-add-employment">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Employment
        </Button>
      )}
    </div>
  );
}

function EducationHistoryForm({ token }: { token: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [institution, setInstitution] = useState("");
  const [qualification, setQualification] = useState("");
  const [subject, setSubject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [grade, setGrade] = useState("");

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "education-history"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/education-history`, {
        institution, qualification, subject: subject || null,
        startDate: startDate || null, endDate: endDate || null, grade: grade || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "education-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({ title: "Education entry added" });
      setShowForm(false);
      setInstitution(""); setQualification(""); setSubject(""); setStartDate(""); setEndDate(""); setGrade("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/portal/${token}/education-history/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "education-history"] });
      toast({ title: "Entry removed" });
    },
  });

  const QUALIFICATIONS = [
    "Diploma in Nursing",
    "BSc Nursing",
    "MSc Nursing",
    "PGDip Nursing",
    "NVQ Level 3 Health & Social Care",
    "Foundation Degree in Health Studies",
    "BSc (Hons) Adult Nursing",
    "BSc (Hons) Mental Health Nursing",
    "BSc (Hons) Children's Nursing",
    "BSc (Hons) Learning Disabilities Nursing",
    "MSc Advanced Clinical Practice",
    "Nurse Prescribing (V300)",
    "GCSE",
    "A-Level",
    "BTEC",
    "Access to Higher Education",
    "Other",
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Education & Qualifications
        </h4>
        <Badge variant="outline" className="text-xs">{entries.length} {entries.length === 1 ? "entry" : "entries"}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        List your nursing qualifications and relevant academic history.
      </p>

      {isLoading && <Skeleton className="h-16 w-full" />}

      {entries.map((entry: any) => (
        <div key={entry.id} className="rounded-lg border border-card-border p-3" data-testid={`education-entry-${entry.id}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-sm">{entry.qualification}{entry.subject ? ` — ${entry.subject}` : ""}</p>
              <p className="text-sm text-muted-foreground">{entry.institution}</p>
              <p className="text-xs text-muted-foreground">
                {entry.startDate || "N/A"} — {entry.endDate || "Present"}
                {entry.grade && <span className="ml-2">• Grade: {entry.grade}</span>}
              </p>
            </div>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
              onClick={() => deleteMutation.mutate(entry.id)}
              data-testid={`button-delete-education-${entry.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3" data-testid="education-form">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Institution *</Label>
              <Input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="e.g. University of Manchester" data-testid="input-edu-institution" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Qualification *</Label>
              <Select value={qualification} onValueChange={setQualification}>
                <SelectTrigger data-testid="select-edu-qualification">
                  <SelectValue placeholder="Select qualification" />
                </SelectTrigger>
                <SelectContent>
                  {QUALIFICATIONS.map(q => (
                    <SelectItem key={q} value={q}>{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subject / Specialism</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Adult Nursing" data-testid="input-edu-subject" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Grade / Classification</Label>
              <Input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. 2:1, Merit, Distinction" data-testid="input-edu-grade" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-edu-start" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} data-testid="input-edu-end" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm" onClick={() => addMutation.mutate()}
              disabled={!institution || !qualification || addMutation.isPending}
              data-testid="button-save-education"
            >
              {addMutation.isPending ? "Saving..." : "Add Entry"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-education">Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} data-testid="button-add-education">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Qualification
        </Button>
      )}
    </div>
  );
}

function ProfileStep({ token, candidate, status }: { token: string; candidate: Candidate; status?: string }) {
  const [employer, setEmployer] = useState(candidate.currentEmployer || "");
  const [band, setBand] = useState(candidate.band?.toString() || "");
  const [yearsQualified, setYearsQualified] = useState(candidate.yearsQualified?.toString() || "");
  const [specialisms, setSpecialisms] = useState<string[]>(candidate.specialisms || []);
  const [unlockedProfileFields, setUnlockedProfileFields] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const isProfileLocked = (field: string, originalValue: string | null | undefined) => {
    const val = originalValue ?? "";
    return val !== "" && !unlockedProfileFields.has(field);
  };
  const unlockProfile = (field: string) => setUnlockedProfileFields(prev => new Set(prev).add(field));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/portal/${token}/candidate`, {
        currentEmployer: employer,
        band: band ? parseInt(band) : null,
        yearsQualified: yearsQualified ? parseInt(yearsQualified) : null,
        specialisms,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      setUnlockedProfileFields(new Set());
      toast({ title: "Profile saved" });
    },
  });

  return (
    <SectionWrapper title="Professional Profile" icon={<Award className="h-5 w-5" />} status={status}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PortalLockedInput label="Current Employer" value={employer} onChange={setEmployer} locked={isProfileLocked("employer", candidate.currentEmployer)} onUnlock={() => unlockProfile("employer")} placeholder="e.g. Royal Marsden NHS Trust" testId="input-portal-employer" />
          <div className="space-y-2">
            <Label>Band</Label>
            {isProfileLocked("band", candidate.band?.toString()) ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-950/10 text-sm">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Band {band}</span>
                  <LockIcon className="h-3 w-3 text-emerald-500/60 shrink-0 ml-auto" />
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-400" onClick={() => unlockProfile("band")}>
                  <Unlock className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>
            ) : (
              <Select value={band} onValueChange={setBand}>
                <SelectTrigger data-testid="select-portal-band">
                  <SelectValue placeholder="Select band" />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 7, 8].map(b => (
                    <SelectItem key={b} value={b.toString()}>Band {b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <PortalLockedInput label="Years Qualified" value={yearsQualified} onChange={setYearsQualified} locked={isProfileLocked("yearsQualified", candidate.yearsQualified?.toString())} onUnlock={() => unlockProfile("yearsQualified")} type="number" placeholder="e.g. 5" testId="input-portal-years" />
          <div className="space-y-2 sm:col-span-2">
            <Label>Clinical Specialisms</Label>
            <SpecialismSelector selected={specialisms} onChange={setSpecialisms} testIdPrefix="portal-specialism" />
          </div>
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-profile">
          {saveMutation.isPending ? "Saving..." : "Save Profile"}
        </Button>

        <Separator />

        <EmploymentHistoryForm token={token} />

        <Separator />

        <EducationHistoryForm token={token} />

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" /> CV Upload (PDF)
          </h4>
          <p className="text-xs text-muted-foreground">
            Upload your most recent CV. This supplements the employment and education history above.
          </p>
          <FileUpload
            uploadUrl={`/api/portal/${token}/upload`}
            accept=".pdf,.doc,.docx"
            onUploadComplete={(file) => {
              apiRequest("POST", `/api/portal/${token}/documents`, {
                type: "CV",
                filename: file.filename,
                originalFilename: file.originalFilename,
                filePath: file.filePath,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                category: "profile",
              }).then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "documents"] });
                queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
                toast({ title: "CV uploaded successfully" });
              });
            }}
          />
        </div>
      </div>
    </SectionWrapper>
  );
}

function CompetencyGuidanceInline({ token, competencyName, domain, specialty }: { token: string; competencyName: string; domain: string; specialty?: string }) {
  const [visible, setVisible] = useState(false);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchGuidance = async () => {
    if (guidance) {
      setVisible(v => !v);
      return;
    }
    setVisible(true);
    setLoading(true);
    try {
      const res = await apiRequest("POST", `/api/portal/${token}/competency-guidance`, {
        competencyName,
        domain,
        ...(specialty ? { specialty } : {}),
      });
      const data = await res.json();
      setGuidance(data.guidance);
    } catch {
      setGuidance("Consider your recent clinical experience in this area. Think about situations where you have performed this skill, how confident you felt, and whether you needed supervision or support.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={fetchGuidance}
        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        data-testid={`button-guidance-${competencyName.substring(0, 20)}`}
      >
        <Lightbulb className="h-3 w-3" />
        {visible ? "Hide guidance" : "Show guidance"}
      </button>
      {visible && (
        <div className="mt-2 rounded-md border border-blue-800/30 bg-blue-950/20 p-3 text-xs text-blue-200 space-y-1">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Generating guidance...</span>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground italic mb-1">
                This guidance is supportive — it does not suggest what level to choose.
              </p>
              <div className="whitespace-pre-line">{guidance}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CompetencyStep({ token, status, specialty }: { token: string; status?: string; specialty?: string }) {
  const { data: declarations, isLoading } = useQuery<CompetencyDeclaration[]>({
    queryKey: ["/api/portal", token, "competency-declarations"],
  });
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async ({ comp, level }: { comp: typeof COMPETENCY_MATRIX[number]; level: string }) => {
      const res = await apiRequest("POST", `/api/portal/${token}/competency-declarations`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "competency-declarations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
    },
  });

  const levelLabels: Record<string, string> = {
    not_declared: "Not Declared",
    level_1: "L1 - Theory",
    level_2: "L2 - Supervised",
    level_3: "L3 - Competent",
    level_4: "L4 - Expert",
  };

  if (isLoading) return <SectionWrapper title="Clinical Competency" icon={<Stethoscope className="h-5 w-5" />} status={status}><Skeleton className="h-40" /></SectionWrapper>;

  const declaredNames = new Set((declarations || []).map(d => d.competencyName));
  const domains = Array.from(new Set(COMPETENCY_MATRIX.map(c => c.domain)));
  const mandatoryCount = COMPETENCY_MATRIX.filter(c => c.mandatory).length;
  const declaredMandatoryCount = (declarations || []).filter(d => {
    const comp = COMPETENCY_MATRIX.find(c => c.competency === d.competencyName);
    return comp?.mandatory;
  }).length;

  return (
    <SectionWrapper title="Clinical Competency" icon={<Stethoscope className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Self-assess your competency level for each clinical skill below. This is your declaration of what you believe you can do — evidence and sign-off happen later.
        </p>

        <div className="rounded-lg border border-blue-800/30 bg-blue-950/20 p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-blue-300">
            <Info className="h-4 w-4 shrink-0" />
            What do the levels mean?
          </p>
          <div className="space-y-3">
            <div className="rounded-md bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-semibold text-foreground">Level 1 — Theory</p>
              <p className="text-xs text-muted-foreground">You understand the theory but have not yet performed this skill on a patient. For example, a newly qualified nurse who has studied wound care in university but hasn't dressed a complex wound independently.</p>
            </div>
            <div className="rounded-md bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-semibold text-foreground">Level 2 — Supervised Practice</p>
              <p className="text-xs text-muted-foreground">You have performed this skill under direct supervision. For example, a nurse who has administered IV medication a few times with a mentor watching and guiding them through the process.</p>
            </div>
            <div className="rounded-md bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-semibold text-foreground">Level 3 — Competent</p>
              <p className="text-xs text-muted-foreground">You can perform this skill independently and safely without supervision. For example, a band 5 nurse with two years' experience who routinely carries out catheterisations, manages IV lines, and performs clinical observations without needing to ask for help.</p>
            </div>
            <div className="rounded-md bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-semibold text-foreground">Level 4 — Expert</p>
              <p className="text-xs text-muted-foreground">You can perform this skill to a high standard and could teach or supervise others. For example, a senior sister or clinical educator who mentors junior staff, leads on complex cases, and is the go-to person on the ward for this particular skill.</p>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium">
          {declaredMandatoryCount} of {mandatoryCount} mandatory competencies declared
        </p>

        {domains.map(domain => {
          const comps = COMPETENCY_MATRIX.filter(c => c.domain === domain);
          return (
            <div key={domain} className="space-y-2">
              <h4 className="text-sm font-semibold">{domain}</h4>
              <div className="space-y-1">
                {comps.map(comp => {
                  const declaration = (declarations || []).find(d => d.competencyName === comp.competency);
                  const isDeclared = !!declaration;

                  return (
                    <div key={comp.competency} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">{comp.competency}</span>
                          {comp.mandatory && (
                            <Badge variant="outline" className="text-[10px] bg-red-950/60 text-red-300 border-red-800/50 shrink-0">Required</Badge>
                          )}
                          {comp.minimumLevel !== "level_1" && (
                            <span className="text-[10px] text-muted-foreground shrink-0">Min: {levelLabels[comp.minimumLevel]}</span>
                          )}
                        </div>
                        {isDeclared ? (
                          <Badge variant="outline" className="bg-emerald-950/60 text-emerald-300 border-emerald-800/50 shrink-0">
                            {levelLabels[declaration.selfAssessedLevel]}
                          </Badge>
                        ) : (
                          <Select
                            onValueChange={(level) => saveMutation.mutate({ comp, level })}
                          >
                            <SelectTrigger className="w-40" data-testid={`select-comp-${comp.competency.substring(0, 20)}`}>
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
                      </div>
                      {!isDeclared && (
                        <CompetencyGuidanceInline token={token} competencyName={comp.competency} domain={comp.domain} specialty={specialty} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}

function TrainingStep({ token, status }: { token: string; status?: string }) {
  const { data: trainings, isLoading } = useQuery<MandatoryTraining[]>({
    queryKey: ["/api/portal", token, "mandatory-training"],
  });
  const { toast } = useToast();
  const [certUploading, setCertUploading] = useState(false);
  const [lastUploadResult, setLastUploadResult] = useState<{ autoRecorded: string[]; aiAnalysis: any[] | null; confidence: string | null } | null>(null);

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertUploading(true);
    setLastUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/portal/${token}/training-cert-ai`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      const result = await res.json();
      setLastUploadResult({
        autoRecorded: result.autoRecorded,
        aiAnalysis: result.aiAnalysis,
        confidence: result.confidence,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "mandatory-training"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({
        title: "Certificate analyzed by AI",
        description: result.autoRecorded.length > 0
          ? `${result.autoRecorded.length} training module(s) detected and auto-recorded`
          : "Certificate uploaded. No matching modules were detected — you can record modules manually below.",
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Could not process training certificate", variant: "destructive" });
    } finally {
      setCertUploading(false);
      e.target.value = "";
    }
  };

  if (isLoading) return <SectionWrapper title="Mandatory Training" icon={<BookOpen className="h-5 w-5" />} status={status}><Skeleton className="h-40" /></SectionWrapper>;

  const recordedModules = new Set((trainings || []).map(t => t.moduleName));
  const completedCount = (trainings || []).filter(t => t.certificateUploaded).length;

  return (
    <SectionWrapper title="Mandatory Training" icon={<BookOpen className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Record completion details and upload certificates for each mandatory training module.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {completedCount} of {MANDATORY_TRAINING_MODULES.length} modules completed with certificates
          </p>
          <label className="cursor-pointer">
            <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleCertUpload} disabled={certUploading} data-testid="input-portal-training-cert-upload" />
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild disabled={certUploading}>
              <span>
                {certUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {certUploading ? "AI Analyzing Certificate..." : "Upload Certificate (AI Auto-Detect)"}
              </span>
            </Button>
          </label>
        </div>

        {lastUploadResult && (
          <div className={`rounded-md border p-3 text-sm ${lastUploadResult.autoRecorded.length > 0 ? "border-emerald-800/50 bg-emerald-950/30" : "border-amber-800/50 bg-amber-950/30"}`}>
            <div className="flex items-start gap-2">
              {lastUploadResult.autoRecorded.length > 0 ? (
                <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              )}
              <div className="space-y-2 flex-1">
                <p className={`font-medium ${lastUploadResult.autoRecorded.length > 0 ? "text-emerald-300" : "text-amber-300"}`}>
                  AI Certificate Analysis {lastUploadResult.confidence === "high" ? "— High Confidence" : lastUploadResult.confidence === "medium" ? "— Medium Confidence" : ""}
                </p>

                {lastUploadResult.autoRecorded.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{lastUploadResult.autoRecorded.length} module(s) auto-recorded:</p>
                    <ul className="list-disc list-inside text-xs text-emerald-300/80">
                      {lastUploadResult.autoRecorded.map(m => <li key={m}>{m}</li>)}
                    </ul>
                  </div>
                )}

                {lastUploadResult.aiAnalysis && lastUploadResult.aiAnalysis.length > 0 && (
                  <div className="border-t border-white/10 pt-2 mt-2">
                    <p className="text-xs text-muted-foreground mb-1">All detected certificates:</p>
                    <div className="space-y-1">
                      {lastUploadResult.aiAnalysis.map((item: any, i: number) => (
                        <div key={i} className="text-xs flex items-center gap-2">
                          {item.matchedModule ? (
                            <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
                          )}
                          <span className="text-foreground/80">{item.detectedTitle}</span>
                          {item.completedDate && <span className="text-muted-foreground">({item.completedDate})</span>}
                          {item.issuingBody && <span className="text-muted-foreground">— {item.issuingBody}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!lastUploadResult.aiAnalysis || lastUploadResult.aiAnalysis.length === 0) && (
                  <p className="text-xs text-amber-400">
                    No training modules were detected in this document. You can still record modules individually below.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {MANDATORY_TRAINING_MODULES.map((mod) => {
            const existing = (trainings || []).find(t => t.moduleName === mod.name);
            return (
              <TrainingModuleRow
                key={mod.name}
                module={mod}
                existing={existing}
                token={token}
              />
            );
          })}
        </div>
      </div>
    </SectionWrapper>
  );
}

function TrainingModuleRow({
  module: mod,
  existing,
  token,
}: {
  module: { name: string; renewalFrequency: string };
  existing?: MandatoryTraining;
  token: string;
}) {
  const [completedDate, setCompletedDate] = useState(existing?.completedDate || "");
  const [issuingBody, setIssuingBody] = useState(existing?.issuingBody || "");
  const [certDocId, setCertDocId] = useState(existing?.certificateDocumentId || "");
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/mandatory-training`, {
        moduleName: mod.name,
        renewalFrequency: mod.renewalFrequency,
        completedDate,
        issuingBody,
        certificateUploaded: !!certDocId,
        certificateDocumentId: certDocId || null,
        status: certDocId ? "completed" : "pending",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "mandatory-training"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({ title: `${mod.name} recorded` });
      setExpanded(false);
    },
  });

  const hasCert = existing?.certificateUploaded;

  return (
    <div className="rounded-md border p-3 space-y-2" data-testid={`training-module-${mod.name.substring(0, 20)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{mod.name}</p>
          <p className="text-xs text-muted-foreground">Renewal: {mod.renewalFrequency}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasCert ? (
            <Badge variant="outline" className="bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
              <CheckCircle className="h-3 w-3 mr-1" /> Certificate uploaded
            </Badge>
          ) : existing ? (
            <Badge variant="outline">
              <AlertCircle className="h-3 w-3 mr-1" /> Needs certificate
            </Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)} data-testid={`button-expand-${mod.name.substring(0, 15)}`}>
              {expanded ? "Cancel" : "Record"}
            </Button>
          )}
        </div>
      </div>

      {(expanded || (existing && !hasCert)) && (
        <div className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Completion Date</Label>
              <Input type="date" value={completedDate} onChange={e => setCompletedDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Issuing Body</Label>
              <Input value={issuingBody} onChange={e => setIssuingBody(e.target.value)} placeholder="e.g. Skills for Health" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Certificate Upload (mandatory)</Label>
            <FileUpload
              uploadUrl={`/api/portal/${token}/upload`}
              onUploadComplete={(file) => {
                apiRequest("POST", `/api/portal/${token}/documents`, {
                  type: `Training Certificate - ${mod.name}`,
                  filename: file.filename,
                  originalFilename: file.originalFilename,
                  filePath: file.filePath,
                  fileSize: file.fileSize,
                  mimeType: file.mimeType,
                  category: "training_certificate",
                }).then(async (res) => {
                  const doc = await res.json();
                  setCertDocId(doc.id);
                });
              }}
            />
          </div>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!completedDate || saveMutation.isPending} data-testid={`button-save-training-${mod.name.substring(0, 15)}`}>
            {saveMutation.isPending ? "Saving..." : "Save Module"}
          </Button>
        </div>
      )}
    </div>
  );
}

function HealthStep({ token, status }: { token: string; status?: string }) {
  const { data: existing } = useQuery<HealthDeclaration | null>({
    queryKey: ["/api/portal", token, "health-declaration"],
  });

  const [hepB, setHepB] = useState(existing?.hepatitisBVaccinated || false);
  const [mmr, setMmr] = useState(existing?.mmrVaccinated || false);
  const [varicella, setVaricella] = useState(existing?.varicellaVaccinated || false);
  const [tb, setTb] = useState(existing?.tbScreened || false);
  const [conditions, setConditions] = useState(existing?.conditionsAffectingPractice || "");
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/health-declaration`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "health-declaration"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({ title: "Health declaration saved" });
    },
  });

  return (
    <SectionWrapper title="Health Declaration" icon={<Heart className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Declare your immunisation status and any conditions that may affect your practice.
        </p>

        <div className="space-y-3">
          <Label className="text-sm font-semibold">Immunisation Status</Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox checked={hepB} onCheckedChange={(c) => setHepB(!!c)} data-testid="checkbox-hep-b" />
              <Label className="text-sm">Hepatitis B vaccinated</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={mmr} onCheckedChange={(c) => setMmr(!!c)} data-testid="checkbox-mmr" />
              <Label className="text-sm">MMR vaccinated</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={varicella} onCheckedChange={(c) => setVaricella(!!c)} data-testid="checkbox-varicella" />
              <Label className="text-sm">Varicella vaccinated</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={tb} onCheckedChange={(c) => setTb(!!c)} data-testid="checkbox-tb" />
              <Label className="text-sm">TB screened</Label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Conditions affecting practice (leave blank if none)</Label>
          <Textarea
            value={conditions}
            onChange={e => setConditions(e.target.value)}
            placeholder="Describe any conditions that may affect your ability to practice..."
            data-testid="input-portal-conditions"
          />
        </div>

        <Separator />
        <div className="space-y-2">
          <Label>Immunisation Records Upload (optional)</Label>
          <FileUpload
            uploadUrl={`/api/portal/${token}/upload`}
            onUploadComplete={(file) => {
              apiRequest("POST", `/api/portal/${token}/documents`, {
                type: "Immunisation Records",
                filename: file.filename,
                originalFilename: file.originalFilename,
                filePath: file.filePath,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                category: "health",
              });
            }}
          />
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-health">
          {saveMutation.isPending ? "Saving..." : "Submit Health Declaration"}
        </Button>
      </div>
    </SectionWrapper>
  );
}

function ReferencesStep({ token, status }: { token: string; status?: string }) {
  const { data: refs, isLoading } = useQuery<Reference[]>({
    queryKey: ["/api/portal", token, "references"],
  });

  const [refereeName, setRefereeName] = useState("");
  const [refereeEmail, setRefereeEmail] = useState("");
  const [refereeOrg, setRefereeOrg] = useState("");
  const [refereeRole, setRefereeRole] = useState("");
  const [relationship, setRelationship] = useState("");
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/references`, {
        refereeName,
        refereeEmail,
        refereeOrg,
        refereeRole,
        relationshipToCandidate: relationship,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "references"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      setRefereeName("");
      setRefereeEmail("");
      setRefereeOrg("");
      setRefereeRole("");
      setRelationship("");
      toast({
        title: "Referee added",
        description: data.emailSent
          ? "A reference questionnaire has been emailed to your referee"
          : "Referee details saved",
      });
    },
  });

  if (isLoading) return <SectionWrapper title="References" icon={<Users className="h-5 w-5" />} status={status}><Skeleton className="h-40" /></SectionWrapper>;

  const existingRefs = refs || [];

  return (
    <SectionWrapper title="References" icon={<Users className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Provide details for two professional referees. They will be contacted directly.
        </p>

        {existingRefs.length > 0 && (
          <div className="space-y-2">
            {existingRefs.map((ref, idx) => (
              <div key={ref.id} className="rounded-md border p-3" data-testid={`referee-${idx}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{ref.refereeName}</span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {ref.outcome === "received" || ref.outcome === "flagged" ? "Response received" : ref.emailSentAt ? "Email sent" : ref.outcome}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 ml-6">
                  <p>{ref.refereeEmail}</p>
                  {ref.refereeOrg && <p>{ref.refereeOrg} — {ref.refereeRole}</p>}
                  {ref.relationshipToCandidate && <p>Relationship: {ref.relationshipToCandidate}</p>}
                  {ref.emailSentAt && (
                    <p className="text-emerald-400">Questionnaire email sent to referee</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {existingRefs.length < 2 && (
          <div className="space-y-3 border rounded-md p-4">
            <h4 className="text-sm font-semibold">Add Referee {existingRefs.length + 1}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Name</Label>
                <Input value={refereeName} onChange={e => setRefereeName(e.target.value)} placeholder="Full name" data-testid="input-referee-name" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={refereeEmail} onChange={e => setRefereeEmail(e.target.value)} placeholder="Email address" data-testid="input-referee-email" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Organisation</Label>
                <Input value={refereeOrg} onChange={e => setRefereeOrg(e.target.value)} placeholder="Organisation" data-testid="input-referee-org" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Role</Label>
                <Input value={refereeRole} onChange={e => setRefereeRole(e.target.value)} placeholder="Job title" data-testid="input-referee-role" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs">Relationship to you</Label>
                <Select value={relationship} onValueChange={setRelationship}>
                  <SelectTrigger data-testid="select-referee-relationship">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Line Manager">Line Manager</SelectItem>
                    <SelectItem value="Supervisor">Supervisor</SelectItem>
                    <SelectItem value="Colleague">Colleague</SelectItem>
                    <SelectItem value="Mentor">Mentor</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => addMutation.mutate()} disabled={!refereeName || !refereeEmail || addMutation.isPending} data-testid="button-add-referee">
              {addMutation.isPending ? "Adding..." : "Add Referee"}
            </Button>
          </div>
        )}
      </div>
    </SectionWrapper>
  );
}

function IndemnityStep({ token, status }: { token: string; status?: string }) {
  const { data: existing } = useQuery<ProfessionalIndemnity | null>({
    queryKey: ["/api/portal", token, "professional-indemnity"],
  });
  const { data: indemnityDocs } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "documents"],
  });

  const [provider, setProvider] = useState(existing?.provider || "");
  const [policyNumber, setPolicyNumber] = useState(existing?.policyNumber || "");
  const [startDate, setStartDate] = useState(existing?.coverStartDate || "");
  const [endDate, setEndDate] = useState(existing?.coverEndDate || "");
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/professional-indemnity`, {
        provider,
        policyNumber,
        coverStartDate: startDate,
        coverEndDate: endDate,
        scopeAppropriate: false,
        verified: false,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "professional-indemnity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({ title: "Indemnity details saved" });
    },
  });

  return (
    <SectionWrapper title="Professional Indemnity" icon={<ShieldCheck className="h-5 w-5" />} status={status}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Provide your professional indemnity insurance details and upload your certificate.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div className="space-y-2">
            <Label>Insurance Provider</Label>
            <Input value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. NST/RCN" data-testid="input-portal-indemnity-provider" />
          </div>
          <div className="space-y-2">
            <Label>Policy Number</Label>
            <Input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} placeholder="Policy number" data-testid="input-portal-indemnity-policy" />
          </div>
          <div className="space-y-2">
            <Label>Cover Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-portal-indemnity-start" />
          </div>
          <div className="space-y-2">
            <Label>Cover End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} data-testid="input-portal-indemnity-end" />
          </div>
        </div>

        <Separator />
        <div className="space-y-2">
          <Label>Indemnity Certificate Upload</Label>
          <FileUpload
            uploadUrl={`/api/portal/${token}/upload`}
            onUploadComplete={(file) => {
              apiRequest("POST", `/api/portal/${token}/documents`, {
                type: "Indemnity Certificate",
                filename: file.filename,
                originalFilename: file.originalFilename,
                filePath: file.filePath,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                category: "indemnity",
              });
            }}
          />
        </div>

        <DocumentAiAlert docs={indemnityDocs} category="indemnity" />

        <Button onClick={() => saveMutation.mutate()} disabled={!provider || saveMutation.isPending} data-testid="button-save-indemnity">
          {saveMutation.isPending ? "Saving..." : "Save Indemnity Details"}
        </Button>
      </div>
    </SectionWrapper>
  );
}

const EO_GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Other", "Prefer not to say"];
const EO_ETHNICITY_OPTIONS = [
  "White — English, Welsh, Scottish, Northern Irish, or British",
  "White — Irish",
  "White — Gypsy or Irish Traveller",
  "White — Any other White background",
  "Mixed — White and Black Caribbean",
  "Mixed — White and Black African",
  "Mixed — White and Asian",
  "Mixed — Any other Mixed or multiple ethnic background",
  "Asian — Indian",
  "Asian — Pakistani",
  "Asian — Bangladeshi",
  "Asian — Chinese",
  "Asian — Any other Asian background",
  "Black — African",
  "Black — Caribbean",
  "Black — Any other Black, African, or Caribbean background",
  "Arab",
  "Any other ethnic group",
  "Prefer not to say",
];
const EO_DISABILITY_OPTIONS = ["Yes", "No", "Prefer not to say"];
const EO_RELIGION_OPTIONS = ["No religion", "Christian", "Buddhist", "Hindu", "Jewish", "Muslim", "Sikh", "Other", "Prefer not to say"];
const EO_ORIENTATION_OPTIONS = ["Heterosexual / Straight", "Gay or Lesbian", "Bisexual", "Other", "Prefer not to say"];
const EO_AGE_BAND_OPTIONS = ["16–24", "25–34", "35–44", "45–54", "55–64", "65+", "Prefer not to say"];

interface EqualOpportunitiesData {
  id: string;
  candidateRef: string;
  gender: string | null;
  ethnicity: string | null;
  disabilityStatus: string | null;
  religionBelief: string | null;
  sexualOrientation: string | null;
  ageBand: string | null;
  submittedAt: string;
  updatedAt: string;
}

function EqualOpportunitiesStep({ token, status }: { token: string; status?: string }) {
  const { data: existing } = useQuery<EqualOpportunitiesData | null>({
    queryKey: ["/api/portal", token, "equal-opportunities"],
  });

  const [gender, setGender] = useState(existing?.gender || "Prefer not to say");
  const [ethnicity, setEthnicity] = useState(existing?.ethnicity || "Prefer not to say");
  const [disabilityStatus, setDisabilityStatus] = useState(existing?.disabilityStatus || "Prefer not to say");
  const [religionBelief, setReligionBelief] = useState(existing?.religionBelief || "Prefer not to say");
  const [sexualOrientation, setSexualOrientation] = useState(existing?.sexualOrientation || "Prefer not to say");
  const [ageBand, setAgeBand] = useState(existing?.ageBand || "Prefer not to say");
  const { toast } = useToast();

  useEffect(() => {
    if (existing) {
      setGender(existing.gender || "Prefer not to say");
      setEthnicity(existing.ethnicity || "Prefer not to say");
      setDisabilityStatus(existing.disabilityStatus || "Prefer not to say");
      setReligionBelief(existing.religionBelief || "Prefer not to say");
      setSexualOrientation(existing.sexualOrientation || "Prefer not to say");
      setAgeBand(existing.ageBand || "Prefer not to say");
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/equal-opportunities`, {
        gender, ethnicity, disabilityStatus, religionBelief, sexualOrientation, ageBand,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "equal-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "onboarding-state"] });
      toast({ title: "Equal opportunities form saved", description: "Thank you for completing this form." });
    },
  });

  return (
    <SectionWrapper title="Equal Opportunities" icon={<Equal className="h-5 w-5" />} status={status}>
      <div className="space-y-5">
        <div className="rounded-md border border-blue-800/40 bg-blue-950/20 p-4 text-sm" data-testid="eq-opps-confidentiality">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />
            <div className="space-y-1.5">
              <p className="font-medium text-blue-300">Confidentiality Notice</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This information is collected for equal opportunities monitoring purposes only, in line with the Equality Act 2010.
                Your responses are confidential, stored separately from your application, used only for aggregate reporting,
                and will <span className="font-semibold">not</span> affect your application or any hiring decisions.
                All fields are optional — you may select "Prefer not to say" for any question.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger data-testid="select-eq-gender">
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {EO_GENDER_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ethnicity</Label>
            <Select value={ethnicity} onValueChange={setEthnicity}>
              <SelectTrigger data-testid="select-eq-ethnicity">
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {EO_ETHNICITY_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Disability Status</Label>
            <Select value={disabilityStatus} onValueChange={setDisabilityStatus}>
              <SelectTrigger data-testid="select-eq-disability">
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {EO_DISABILITY_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Religion or Belief</Label>
            <Select value={religionBelief} onValueChange={setReligionBelief}>
              <SelectTrigger data-testid="select-eq-religion">
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {EO_RELIGION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sexual Orientation</Label>
            <Select value={sexualOrientation} onValueChange={setSexualOrientation}>
              <SelectTrigger data-testid="select-eq-orientation">
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {EO_ORIENTATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Age Band</Label>
            <Select value={ageBand} onValueChange={setAgeBand}>
              <SelectTrigger data-testid="select-eq-ageband">
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent>
                {EO_AGE_BAND_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-eq-opps">
          {saveMutation.isPending ? "Saving..." : "Save Equal Opportunities Form"}
        </Button>
      </div>
    </SectionWrapper>
  );
}

export default function PortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [currentStep, setCurrentStep] = useState(1);

  const { data: verifyData, isLoading: verifyLoading, error: verifyError } = useQuery<{
    candidate: Candidate;
    token: string;
  }>({
    queryKey: ["/api/portal/verify", token],
    enabled: !!token,
  });

  const { data: onboardingState } = useQuery<OnboardingState | null>({
    queryKey: ["/api/portal", token, "onboarding-state"],
    enabled: !!verifyData,
  });

  const { data: portalDocs } = useQuery<any[]>({
    queryKey: ["/api/portal", token, "documents"],
    enabled: !!verifyData,
    refetchInterval: (query) => {
      const docs = query.state.data as any[] | undefined;
      if (docs?.some((d: any) => d.aiStatus === "pending")) return 5000;
      return false;
    },
  });

  const { data: candidate } = useQuery<Candidate>({
    queryKey: ["/api/portal", token, "candidate"],
    enabled: !!verifyData,
  });

  if (verifyLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="portal-loading">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying your portal link...</p>
        </div>
      </div>
    );
  }

  if (verifyError || !verifyData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="portal-error">
        <div className="text-center space-y-3 max-w-md px-4">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold">Invalid or Expired Link</h1>
          <p className="text-sm text-muted-foreground">
            This portal link is invalid or has expired. Please contact your onboarding coordinator for a new link.
          </p>
        </div>
      </div>
    );
  }

  const activeCandidate = candidate || verifyData.candidate;
  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};

  const currentPortalStep = PORTAL_STEPS[currentStep - 1];

  const stepComponents: Record<number, React.ReactNode> = {
    1: <IdentityStep token={token} candidate={activeCandidate} status={stepStatuses.identity} />,
    2: <NmcStep token={token} candidate={activeCandidate} status={stepStatuses.nmc} />,
    3: <DbsStep token={token} candidate={activeCandidate} status={stepStatuses.dbs} />,
    4: <RightToWorkStep token={token} status={stepStatuses.right_to_work} />,
    5: <ProfileStep token={token} candidate={activeCandidate} status={stepStatuses.profile} />,
    6: <CompetencyStep token={token} status={stepStatuses.competency} specialty={activeCandidate.specialisms?.join(", ")} />,
    7: <TrainingStep token={token} status={stepStatuses.training} />,
    8: <HealthStep token={token} status={stepStatuses.health} />,
    9: <ReferencesStep token={token} status={stepStatuses.references} />,
    10: <IndemnityStep token={token} status={stepStatuses.indemnity} />,
    11: <EqualOpportunitiesStep token={token} status={stepStatuses.equal_opportunities} />,
  };

  const totalSteps = PORTAL_STEPS.length;

  return (
    <PortalLayout
      candidateName={activeCandidate.fullName}
      stepStatuses={stepStatuses}
      currentStep={currentStep}
      onStepClick={setCurrentStep}
    >
      <div className="space-y-4" data-testid="portal-page">
        {stepComponents[currentStep]}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {currentStep > 1 && (
            <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)} data-testid="button-prev-step">
              Previous Step
            </Button>
          )}
          {currentStep < totalSteps && (
            <Button onClick={() => setCurrentStep(currentStep + 1)} className="ml-auto" data-testid="button-next-step">
              Next Step
            </Button>
          )}
        </div>
      </div>

      <ChatWidget
        token={token}
        currentStep={currentStep}
        stepKey={currentPortalStep?.key || "identity"}
        stepName={currentPortalStep?.name || "Identity & Contact"}
      />
    </PortalLayout>
  );
}
