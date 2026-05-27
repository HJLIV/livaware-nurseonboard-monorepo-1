// Supervision & Appraisals panel (task 162) — admin-only per-nurse log
// of 1:1 supervision/appraisal/reflective conversations. Used on both
// the nurse profile (/nurses/:id) and the candidate profile
// (/candidates/:id) so the surface is reachable wherever a per-person
// profile is open.
import { useState } from "react";
import type React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useAuthRole } from "@/lib/use-auth-role";
import { Download, Loader2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";

export interface SupervisionEntry {
  id: string;
  nurseId: string;
  type: "supervision" | "appraisal" | "reflection" | "other";
  title: string | null;
  conversationDate: string;
  notes: string;
  attachmentFilename: string | null;
  attachmentOriginalFilename: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

const SUPERVISION_TYPE_LABELS: Record<SupervisionEntry["type"], string> = {
  supervision: "Supervision",
  appraisal: "Appraisal",
  reflection: "Reflective conversation",
  other: "Other",
};

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function useSupervisionCount(nurseId: string) {
  const { data } = useQuery<SupervisionEntry[]>({
    queryKey: [`/api/admin/nurses/${nurseId}/supervisions`],
    enabled: !!nurseId,
  });
  return data?.length ?? 0;
}

export function SupervisionPanel({ nurseId }: { nurseId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuthRole();
  const { user } = useAuth();
  // Mirror server's agentName format ("username (role)" for admin
  // sessions, bare username otherwise) so we can hide edit/delete on
  // rows the current user did not author.
  const sessionAgent =
    user?.role && user?.username ? `${user.username} (${user.role})` : user?.username || "";

  const { data: entries, isLoading } = useQuery<SupervisionEntry[]>({
    queryKey: [`/api/admin/nurses/${nurseId}/supervisions`],
    enabled: !!nurseId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupervisionEntry | null>(null);
  const [form, setForm] = useState({
    type: "supervision" as SupervisionEntry["type"],
    title: "",
    conversationDate: todayIso(),
    notes: "",
    file: null as File | null,
    removeAttachment: false,
  });
  const [submitting, setSubmitting] = useState(false);

  function openNew() {
    setEditing(null);
    setForm({
      type: "supervision",
      title: "",
      conversationDate: todayIso(),
      notes: "",
      file: null,
      removeAttachment: false,
    });
    setDialogOpen(true);
  }

  function openEdit(entry: SupervisionEntry) {
    setEditing(entry);
    setForm({
      type: entry.type,
      title: entry.title || "",
      conversationDate: entry.conversationDate,
      notes: entry.notes,
      file: null,
      removeAttachment: false,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.notes.trim()) {
      toast({ title: "Notes are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("type", form.type);
      fd.append("conversationDate", form.conversationDate);
      fd.append("notes", form.notes);
      if (form.title.trim()) fd.append("title", form.title.trim());
      if (form.file) fd.append("file", form.file);
      if (editing && form.removeAttachment && !form.file) {
        fd.append("removeAttachment", "true");
      }
      const url = editing
        ? `/api/admin/supervisions/${editing.id}`
        : `/api/admin/nurses/${nurseId}/supervisions`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Save failed" }));
        throw new Error(body.message || "Save failed");
      }
      await qc.invalidateQueries({ queryKey: [`/api/admin/nurses/${nurseId}/supervisions`] });
      await qc.invalidateQueries({ queryKey: [`/api/nurses/${nurseId}/audit-log`] });
      await qc.invalidateQueries({ queryKey: [`/api/candidates/${nurseId}/audit-log`] });
      toast({ title: editing ? "Entry updated" : "Entry added" });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/supervisions/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Delete failed" }));
        throw new Error(body.message || "Delete failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [`/api/admin/nurses/${nurseId}/supervisions`] });
      await qc.invalidateQueries({ queryKey: [`/api/nurses/${nurseId}/audit-log`] });
      await qc.invalidateQueries({ queryKey: [`/api/candidates/${nurseId}/audit-log`] });
      toast({ title: "Entry deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    },
  });

  function canMutate(entry: SupervisionEntry): boolean {
    if (isSuperAdmin) return true;
    return !!sessionAgent && entry.createdBy === sessionAgent;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
            Internal record
          </p>
          <h2 className="font-serif text-xl font-light tracking-tight">
            Supervision &amp; Appraisals
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Admin-only log of 1:1 supervision calls, appraisals, and reflective
            conversations. The nurse cannot see these entries.
          </p>
        </div>
        <Button onClick={openNew} data-testid="button-add-supervision">
          <Plus className="h-4 w-4 mr-1.5" /> Add entry
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !entries || entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No supervision entries yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add the summary of your last 1:1 to keep a running record.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id} data-testid={`supervision-entry-${entry.id}`}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[11px]">
                      {SUPERVISION_TYPE_LABELS[entry.type]}
                    </Badge>
                    <span className="text-sm font-medium">
                      {new Date(entry.conversationDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {entry.title && (
                      <span className="text-sm text-muted-foreground">— {entry.title}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canMutate(entry) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(entry)}
                          data-testid={`button-edit-supervision-${entry.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Delete this entry? This cannot be undone.")) {
                              deleteEntry.mutate(entry.id);
                            }
                          }}
                          data-testid={`button-delete-supervision-${entry.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap text-foreground/90">{entry.notes}</p>
                {entry.attachmentFilename && (
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <a
                      href={`/api/admin/supervisions/${entry.id}/attachment`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      data-testid={`link-supervision-attachment-${entry.id}`}
                    >
                      <Download className="h-3 w-3" />
                      {entry.attachmentOriginalFilename || entry.attachmentFilename}
                    </a>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground border-t pt-2">
                  Logged by {entry.createdBy} ·{" "}
                  {new Date(entry.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {entry.updatedBy && entry.updatedAt !== entry.createdAt && (
                    <>
                      {" · "}edited by {entry.updatedBy} on{" "}
                      {new Date(entry.updatedAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit entry" : "Add supervision entry"}</DialogTitle>
            <DialogDescription>
              Internal record — the nurse will not see this.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="supervision-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as SupervisionEntry["type"] }))
                  }
                >
                  <SelectTrigger id="supervision-type" data-testid="select-supervision-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUPERVISION_TYPE_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supervision-date">Date of conversation</Label>
                <Input
                  id="supervision-date"
                  type="date"
                  required
                  value={form.conversationDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conversationDate: e.target.value }))
                  }
                  data-testid="input-supervision-date"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supervision-title">Title / subject (optional)</Label>
              <Input
                id="supervision-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Mid-year appraisal"
                data-testid="input-supervision-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supervision-notes">Notes</Label>
              <Textarea
                id="supervision-notes"
                required
                rows={10}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Paste the call summary or write notes here. Line breaks are preserved."
                data-testid="textarea-supervision-notes"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supervision-file">Attachment (optional)</Label>
              <Input
                id="supervision-file"
                type="file"
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) =>
                  setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))
                }
                data-testid="input-supervision-file"
              />
              {editing?.attachmentFilename && !form.file && (
                <div className="flex items-center justify-between text-xs text-muted-foreground border rounded-md px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="h-3 w-3" />
                    Current: {editing.attachmentOriginalFilename || editing.attachmentFilename}
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.removeAttachment}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, removeAttachment: e.target.checked }))
                      }
                      data-testid="checkbox-remove-attachment"
                    />
                    Remove
                  </label>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} data-testid="button-save-supervision">
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editing ? "Save changes" : "Add entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
