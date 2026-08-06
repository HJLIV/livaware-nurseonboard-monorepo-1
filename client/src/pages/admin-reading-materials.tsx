// Admin page for managing reading materials — admin-added documents and
// other reading nurses must read (and optionally confirm) in their portal.
// Mirrors the Policies admin page but supports keeping the uploaded source
// file (downloadable) and shows a per-nurse read/outstanding status view.

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SuperAdminViewOnlyBanner, SuperAdminGate } from "@/components/super-admin-only";
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
import { Plus, Pencil, Trash2, Users, FileText, Loader2, Upload, Download, BookOpen } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface ReadingMaterial {
  id: string;
  title: string;
  body: string | null;
  pdfUrl: string | null;
  version: string;
  isActive: boolean;
  requireAcknowledgement: boolean;
  sortOrder: number;
  readingCategory: string | null;
  sourceFileName: string | null;
  sourceFilePath: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NurseStatusRow {
  nurseId: string;
  fullName: string;
  email: string;
  currentStage: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  totalActiveSeconds?: number | null;
  sessionCount?: number | null;
  scrolledToEnd?: boolean | null;
  openedPdf?: boolean | null;
}

interface NurseStatusResponse {
  material: { id: string; title: string; version: string; requireAcknowledgement: boolean };
  canViewReadBehaviour: boolean;
  nurses: NurseStatusRow[];
}

interface ReadSummary {
  totalAcknowledgements: number;
  trackedAcknowledgements: number;
  medianReadSeconds: number | null;
  skimmedCount: number;
  skimmedPct: number | null;
  skimThresholdSeconds: number;
}

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
  linkUrl: string;
  readingCategory: string;
  version: string;
  isActive: boolean;
  requireAcknowledgement: boolean;
  sortOrder: number;
}

const emptyForm: FormState = {
  title: "",
  body: "",
  linkUrl: "",
  readingCategory: "",
  version: "1.0",
  isActive: true,
  requireAcknowledgement: true,
  sortOrder: 0,
};

export default function AdminReadingMaterialsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canViewReadBehaviour = !!user?.canViewPolicyReadBehaviour;
  const [editing, setEditing] = useState<ReadingMaterial | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [viewingStatus, setViewingStatus] = useState<ReadingMaterial | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: materials, isLoading } = useQuery<ReadingMaterial[]>({
    queryKey: ["/api/admin/reading-materials"],
  });

  const { data: nurseStatus } = useQuery<NurseStatusResponse>({
    queryKey: [`/api/admin/reading-materials/${viewingStatus?.id}/nurse-status`],
    enabled: !!viewingStatus,
  });

  // Reading materials share the policies read-summary endpoint (same table).
  const { data: readSummary } = useQuery<ReadSummary>({
    queryKey: [`/api/admin/policies/${viewingStatus?.id}/read-summary`],
    enabled: !!viewingStatus && canViewReadBehaviour,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const payload = {
          title: form.title,
          body: form.body || null,
          linkUrl: form.linkUrl || null,
          readingCategory: form.readingCategory || null,
          version: form.version,
          isActive: form.isActive,
          requireAcknowledgement: form.requireAcknowledgement,
          sortOrder: Number(form.sortOrder) || 0,
        };
        const res = await apiRequest("PATCH", `/api/admin/reading-materials/${editing.id}`, payload);
        return await res.json();
      }
      const fd = new FormData();
      fd.append("title", form.title);
      if (form.body) fd.append("body", form.body);
      if (form.linkUrl) fd.append("linkUrl", form.linkUrl);
      if (form.readingCategory) fd.append("readingCategory", form.readingCategory);
      fd.append("version", form.version);
      fd.append("isActive", String(form.isActive));
      fd.append("requireAcknowledgement", String(form.requireAcknowledgement));
      fd.append("sortOrder", String(Number(form.sortOrder) || 0));
      if (pendingFile) fd.append("file", pendingFile);
      const res = await fetch("/api/admin/reading-materials", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Could not save this reading material.";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {}
        throw new Error(message);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reading-materials"] });
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      setPendingFile(null);
      toast({ title: editing ? "Reading material updated" : "Reading material created" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/reading-materials/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reading-materials"] });
      toast({ title: "Reading material deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    },
  });

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setPendingFile(file);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPendingFile(null);
    setShowForm(true);
  };

  const openEdit = (m: ReadingMaterial) => {
    setEditing(m);
    setForm({
      title: m.title,
      body: m.body || "",
      linkUrl: m.pdfUrl || "",
      readingCategory: m.readingCategory || "",
      version: m.version,
      isActive: m.isActive,
      requireAcknowledgement: m.requireAcknowledgement,
      sortOrder: m.sortOrder,
    });
    setPendingFile(null);
    setShowForm(true);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
            Compliance
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight">Reading materials</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Documents and other reading nurses must read in their portal.
            Reading time is tracked the same way as policies, and bumping the
            version forces nurses to re-confirm.
          </p>
        </div>
        <SuperAdminGate>
          <Button onClick={openCreate} data-testid="button-new-reading-material" tooltip="Add a new reading item nurses must read in their portal.">
            <Plus className="h-4 w-4 mr-1.5" />
            New Reading Item
          </Button>
        </SuperAdminGate>
      </div>

      <SuperAdminViewOnlyBanner />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !materials || materials.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No reading materials yet. Click <strong>New Reading Item</strong> to add the first one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Source file</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m) => (
                  <TableRow key={m.id} data-testid={`reading-row-${m.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        {m.title}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.readingCategory || "—"}
                    </TableCell>
                    <TableCell>v{m.version}</TableCell>
                    <TableCell>
                      {m.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.requireAcknowledgement ? "Confirmation required" : "Optional"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.sourceFilePath ? (
                        <a
                          href={`/api/admin/reading-materials/${m.id}/file`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                          data-testid={`link-download-${m.id}`}
                        >
                          <Download className="h-3 w-3" />
                          {m.sourceFileName || "Download"}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setViewingStatus(m)}
                          data-testid={`button-view-status-${m.id}`}
                          title="View per-nurse status"
                          tooltip="See which nurses have read this item and who is outstanding."
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <SuperAdminGate>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(m)}
                            data-testid={`button-edit-reading-${m.id}`}
                            tooltip="Edit this reading item."
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete "${m.title}"? This will also delete all read confirmations for this item.`)) {
                                deleteMutation.mutate(m.id);
                              }
                            }}
                            data-testid={`button-delete-reading-${m.id}`}
                            tooltip="Permanently delete this reading item and every confirmation of it."
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
            <DialogTitle>{editing ? "Edit reading material" : "New reading material"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Bumping the version number will force all nurses to re-confirm."
                : "Upload a document (kept and downloadable), paste text, or add a link."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!editing && (
              <div className="rounded-md border border-dashed bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <Label className="text-sm">Source document (optional)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Upload a <strong>.pdf</strong> or <strong>.docx</strong> (max 10 MB). The file is
                      kept and downloadable by nurses; its text is extracted into the body if you leave it blank.
                    </p>
                    {pendingFile && (
                      <p className="text-xs mt-1 font-medium" data-testid="pending-file-name">
                        {pendingFile.name}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-pick-reading-file"
                    tooltip="Choose a Word or PDF file to attach as the source document."
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    {pendingFile ? "Change file" : "Choose file"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleFilePick}
                    data-testid="input-reading-file"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="reading-title">Title</Label>
              <Input
                id="reading-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Winter infection-control guidance"
                data-testid="input-reading-title"
              />
              {!editing && pendingFile && !form.title && (
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank to use the title extracted from the document.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="reading-category">Category</Label>
                <Input
                  id="reading-category"
                  value={form.readingCategory}
                  onChange={(e) => setForm({ ...form, readingCategory: e.target.value })}
                  placeholder="e.g. Guidance"
                  data-testid="input-reading-category"
                />
              </div>
              <div>
                <Label htmlFor="reading-version">Version</Label>
                <Input
                  id="reading-version"
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="1.0"
                  data-testid="input-reading-version"
                />
              </div>
              <div>
                <Label htmlFor="reading-sort">Sort order</Label>
                <Input
                  id="reading-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="reading-body">Text (optional if uploading a document or link)</Label>
              <Textarea
                id="reading-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Paste the reading text here. Markdown is supported."
                rows={10}
                className="font-mono text-xs"
                data-testid="input-reading-body"
              />
            </div>

            <div>
              <Label htmlFor="reading-link">Link (optional)</Label>
              <Input
                id="reading-link"
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                placeholder="https://…"
                data-testid="input-reading-link"
              />
              <p className="text-xs text-muted-foreground mt-1">
                An external link nurses can open to read the material.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="reading-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive items are hidden from nurses.</p>
              </div>
              <Switch
                id="reading-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="reading-require">Require read confirmation</Label>
                <p className="text-xs text-muted-foreground">If off, the item is read-only.</p>
              </div>
              <Switch
                id="reading-require"
                checked={form.requireAcknowledgement}
                onCheckedChange={(v) => setForm({ ...form, requireAcknowledgement: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={(!form.title && !pendingFile) || saveMutation.isPending}
              data-testid="button-save-reading"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? "Save changes" : "Create reading item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingStatus} onOpenChange={(open) => !open && setViewingStatus(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Read status — {viewingStatus?.title}</DialogTitle>
            <DialogDescription>
              Per-nurse read / outstanding status for this item (current version v{viewingStatus?.version}).
            </DialogDescription>
          </DialogHeader>

          {!nurseStatus ? (
            <Skeleton className="h-32" />
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
                      Confirmed in &lt;{readSummary.skimThresholdSeconds}s
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
              <div className="max-h-[24rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nurse</TableHead>
                      <TableHead>Status</TableHead>
                      {nurseStatus.canViewReadBehaviour && (
                        <>
                          <TableHead>Time spent</TableHead>
                          <TableHead className="text-center">Sessions</TableHead>
                          <TableHead className="text-center">Scrolled</TableHead>
                        </>
                      )}
                      <TableHead>Read on</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nurseStatus.nurses.map((n) => {
                      const tracked = (n.sessionCount ?? 0) > 0 || (n.totalActiveSeconds ?? 0) > 0;
                      return (
                        <TableRow key={n.nurseId} data-testid={`status-row-${n.nurseId}`}>
                          <TableCell className="text-xs">
                            <div className="font-medium">{n.fullName}</div>
                            <div className="text-muted-foreground">{n.email}</div>
                          </TableCell>
                          <TableCell>
                            {n.acknowledged ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Read</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Outstanding</Badge>
                            )}
                          </TableCell>
                          {nurseStatus.canViewReadBehaviour && (
                            <>
                              <TableCell className="text-xs">{tracked ? formatReadDuration(n.totalActiveSeconds) : "—"}</TableCell>
                              <TableCell className="text-xs text-center">{tracked ? n.sessionCount : "—"}</TableCell>
                              <TableCell className="text-xs text-center">{tracked ? (n.scrolledToEnd ? "Yes" : "No") : "—"}</TableCell>
                            </>
                          )}
                          <TableCell className="text-xs text-muted-foreground">
                            {n.acknowledgedAt ? new Date(n.acknowledgedAt).toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
