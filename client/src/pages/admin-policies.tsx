// Admin page for managing the master list of policies that nurses must
// read & sign in the portal. Supports create / edit / delete / toggle
// active and viewing the per-policy acknowledgement audit list.

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SuperAdminViewOnlyBanner, SuperAdminGate } from "@/components/super-admin-only";
import { useAuthRole } from "@/lib/use-auth-role";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, FileText, Loader2, Upload, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PolicyBody } from "@/components/policy-body";

interface Policy {
  id: string;
  title: string;
  body: string | null;
  pdfUrl: string | null;
  version: string;
  isActive: boolean;
  requireAcknowledgement: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Acknowledgement {
  id: string;
  nurseId: string;
  policyId: string;
  policyVersion: string;
  acknowledgedAt: string;
  ipAddress: string | null;
  // Reading-behaviour fields are only populated for admins in the
  // stricter "policy read-behaviour" tier; otherwise the server omits
  // them entirely.
  totalActiveSeconds?: number;
  sessionCount?: number;
  scrolledToEnd?: boolean;
  openedPdf?: boolean;
}

interface ReadSummary {
  totalAcknowledgements: number;
  trackedAcknowledgements: number;
  medianReadSeconds: number | null;
  skimmedCount: number;
  skimmedPct: number | null;
  skimThresholdSeconds: number;
}

const SKIM_THRESHOLD_SECONDS = 10;

function formatReadDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

interface FormState {
  title: string;
  body: string;
  pdfUrl: string;
  version: string;
  isActive: boolean;
  requireAcknowledgement: boolean;
  sortOrder: number;
}

const emptyForm: FormState = {
  title: "",
  body: "",
  pdfUrl: "",
  version: "1.0",
  isActive: true,
  requireAcknowledgement: true,
  sortOrder: 0,
};

export default function AdminPoliciesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  // Stricter admin tier — hides the median/skimmed summary card and the
  // time-spent / scrolled / pdf columns for admins without the flag.
  const canViewReadBehaviour = !!user?.canViewPolicyReadBehaviour;
  const [editing, setEditing] = useState<Policy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [viewingAcks, setViewingAcks] = useState<Policy | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/admin/policies"],
  });

  const { data: acknowledgements } = useQuery<Acknowledgement[]>({
    queryKey: [`/api/admin/policies/${viewingAcks?.id}/acknowledgements`],
    enabled: !!viewingAcks,
  });

  const { data: readSummary } = useQuery<ReadSummary>({
    queryKey: [`/api/admin/policies/${viewingAcks?.id}/read-summary`],
    // Don't even fetch the summary for admins without the stricter
    // permission — the endpoint will 403 anyway.
    enabled: !!viewingAcks && canViewReadBehaviour,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        body: form.body || null,
        pdfUrl: form.pdfUrl || null,
        version: form.version,
        isActive: form.isActive,
        requireAcknowledgement: form.requireAcknowledgement,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) {
        const res = await apiRequest("PATCH", `/api/admin/policies/${editing.id}`, payload);
        return await res.json();
      }
      const res = await apiRequest("POST", "/api/admin/policies", payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      toast({ title: editing ? "Policy updated" : "Policy created" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/policies/extract", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Could not import this document.";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {}
        throw new Error(message);
      }
      return (await res.json()) as { title: string; body: string; aiCleaned?: boolean; aiCleanupReason?: string };
    },
    onSuccess: (data) => {
      setForm((prev) => ({
        ...prev,
        title: data.title?.trim() || prev.title,
        body: data.body?.trim() || prev.body,
      }));
      if (data.aiCleaned) {
        toast({
          title: "Document imported and tidied with AI",
          description: "Headings, lists and paragraphs were reconstructed by AI — please review the body before saving.",
        });
      } else {
        const reason = data.aiCleanupReason;
        let suffix = "";
        if (reason === "no_api_key") {
          suffix = " (AI cleanup is unavailable — no API key configured.)";
        } else if (reason === "api_error" || reason === "empty_response") {
          suffix = " (AI cleanup couldn't run this time — using the raw extracted text.)";
        }
        toast({
          title: "Document imported",
          description: `Title and policy text have been filled in.${suffix} Review and edit before saving.`,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err?.message, variant: "destructive" });
    },
  });

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
      toast({ title: "Unsupported file type", description: "Please upload a .pdf or .docx file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 10 MB.", variant: "destructive" });
      return;
    }
    importMutation.mutate(file);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/policies/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      toast({ title: "Policy deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (p: Policy) => {
    setEditing(p);
    setForm({
      title: p.title,
      body: p.body || "",
      pdfUrl: p.pdfUrl || "",
      version: p.version,
      isActive: p.isActive,
      requireAcknowledgement: p.requireAcknowledgement,
      sortOrder: p.sortOrder,
    });
    setShowForm(true);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
            Compliance
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight">Policies</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Manage the policies nurses must read &amp; acknowledge in their
            portal. Bumping a policy's version forces all nurses to
            re-acknowledge the new version.
          </p>
        </div>
        <SuperAdminGate><Button onClick={openCreate} data-testid="button-new-policy">
          <Plus className="h-4 w-4 mr-1.5" />
          New Policy
        </Button></SuperAdminGate>
      </div>

      <SuperAdminViewOnlyBanner />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !policies || policies.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No policies yet. Click <strong>New Policy</strong> to add the first one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id} data-testid={`policy-row-${p.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {p.title}
                      </div>
                    </TableCell>
                    <TableCell>v{p.version}</TableCell>
                    <TableCell>
                      {p.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.requireAcknowledgement ? "Acknowledgement required" : "Optional"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setViewingAcks(p)}
                          data-testid={`button-view-acks-${p.id}`}
                          title="View acknowledgements"
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <SuperAdminGate>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(p)}
                            data-testid={`button-edit-${p.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete "${p.title}"? This will also delete all acknowledgements for this policy.`)) {
                                deleteMutation.mutate(p.id);
                              }
                            }}
                            data-testid={`button-delete-${p.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </SuperAdminGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit policy" : "New policy"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Bumping the version number will force all nurses to re-acknowledge."
                : "Add a new policy nurses must read in their portal."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-dashed bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <Label className="text-sm">Import from document</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload a <strong>.pdf</strong> or <strong>.docx</strong> file (max 10 MB) to fill in the
                    title and policy text. You can edit the populated fields before saving.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importMutation.isPending}
                  data-testid="button-import-policy"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1.5" />
                  )}
                  {importMutation.isPending ? "Reading…" : "Choose file"}
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={handleImportFile}
                  data-testid="input-import-policy"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="policy-title">Title</Label>
              <Input
                id="policy-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Code of Conduct"
                data-testid="input-policy-title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="policy-version">Version</Label>
                <Input
                  id="policy-version"
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="1.0"
                  data-testid="input-policy-version"
                />
              </div>
              <div>
                <Label htmlFor="policy-sort">Sort order</Label>
                <Input
                  id="policy-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="policy-body">Policy text</Label>
              <Tabs defaultValue="edit" className="mt-1.5">
                <TabsList className="h-8">
                  <TabsTrigger value="edit" className="text-xs" data-testid="tab-policy-edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs" data-testid="tab-policy-preview">
                    Preview as nurse
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="mt-2">
                  <Textarea
                    id="policy-body"
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="The full text of the policy. Markdown is supported (headings, **bold**, lists, tables)."
                    rows={12}
                    className="font-mono text-xs"
                    data-testid="input-policy-body"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Markdown is rendered for nurses — use <code>#</code> for headings,
                    <code> -</code> for bullets, <code>**bold**</code>, etc.
                  </p>
                </TabsContent>
                <TabsContent value="preview" className="mt-2">
                  <div
                    className="rounded-md border bg-card p-5 max-h-[28rem] overflow-y-auto"
                    data-testid="policy-preview-frame"
                  >
                    <div className="max-w-2xl mx-auto">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold">
                            {form.title || "(untitled policy)"}
                          </h3>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                            v{form.version || "1.0"}
                          </span>
                        </div>
                      </div>
                      {form.body ? (
                        <PolicyBody body={form.body} data-testid="policy-preview-body" />
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          Nothing to preview yet — start typing in the Edit tab or import a document.
                        </p>
                      )}
                      {form.pdfUrl && (
                        <a
                          href={form.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary inline-flex items-center gap-1 mt-3 hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Open full PDF
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {form.requireAcknowledgement && (
                        <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t">
                          <p className="text-xs text-muted-foreground">
                            Confirm you have read and understood this policy.
                          </p>
                          <Button size="sm" disabled data-testid="policy-preview-ack-button">
                            I have read &amp; understood
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div>
              <Label htmlFor="policy-pdf">PDF URL (optional)</Label>
              <Input
                id="policy-pdf"
                value={form.pdfUrl}
                onChange={(e) => setForm({ ...form, pdfUrl: e.target.value })}
                placeholder="https://…/policy.pdf"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A direct link nurses can open to read the full PDF.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="policy-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive policies are hidden from nurses.</p>
              </div>
              <Switch
                id="policy-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="policy-require">Require acknowledgement</Label>
                <p className="text-xs text-muted-foreground">If off, the policy is read-only.</p>
              </div>
              <Switch
                id="policy-require"
                checked={form.requireAcknowledgement}
                onCheckedChange={(v) => setForm({ ...form, requireAcknowledgement: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.title || saveMutation.isPending}
              data-testid="button-save-policy"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? "Save changes" : "Create policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingAcks} onOpenChange={(open) => !open && setViewingAcks(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Acknowledgements — {viewingAcks?.title}</DialogTitle>
            <DialogDescription>
              All nurses who have acknowledged this policy.
            </DialogDescription>
          </DialogHeader>

          {!acknowledgements ? (
            <Skeleton className="h-32" />
          ) : acknowledgements.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No acknowledgements yet.
            </div>
          ) : (
            <div className="space-y-4">
              {canViewReadBehaviour && readSummary && readSummary.trackedAcknowledgements > 0 && (
                <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/20 p-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">Median read time</p>
                    <p className="font-serif text-2xl font-light">{formatReadDuration(readSummary.medianReadSeconds)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">across {readSummary.trackedAcknowledgements} tracked</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                      Acked in &lt;{readSummary.skimThresholdSeconds}s
                    </p>
                    <p className="font-serif text-2xl font-light">
                      {readSummary.skimmedPct == null ? "—" : `${readSummary.skimmedPct}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">Likely skimmed</p>
                    <p className="font-serif text-2xl font-light">{readSummary.skimmedCount}</p>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nurse ID</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Acknowledged</TableHead>
                    {canViewReadBehaviour && (
                      <>
                        <TableHead>Time spent</TableHead>
                        <TableHead className="text-center">Sessions</TableHead>
                        <TableHead className="text-center">Scrolled</TableHead>
                        <TableHead className="text-center">PDF</TableHead>
                      </>
                    )}
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acknowledgements.map((a) => {
                    const sessionCount = a.sessionCount ?? 0;
                    const totalSecs = a.totalActiveSeconds ?? 0;
                    const tracked = sessionCount > 0 || totalSecs > 0;
                    const skimmed = tracked && totalSecs < SKIM_THRESHOLD_SECONDS;
                    return (
                      <TableRow key={a.id} data-testid={`ack-row-${a.id}`}>
                        <TableCell className="font-mono text-xs">{a.nurseId.slice(0, 8)}…</TableCell>
                        <TableCell>v{a.policyVersion}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(a.acknowledgedAt).toLocaleString()}
                        </TableCell>
                        {canViewReadBehaviour && (
                          <>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1.5">
                                <span>{tracked ? formatReadDuration(totalSecs) : "—"}</span>
                                {skimmed && (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px] px-1 py-0">
                                    skimmed
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-center">{tracked ? sessionCount : "—"}</TableCell>
                            <TableCell className="text-xs text-center">
                              {tracked ? (a.scrolledToEnd ? "Yes" : "No") : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              {tracked ? (a.openedPdf ? "Yes" : "No") : "—"}
                            </TableCell>
                          </>
                        )}
                        <TableCell className="text-xs text-muted-foreground">{a.ipAddress || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
