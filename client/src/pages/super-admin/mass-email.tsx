// Super Admin → Mass email broadcast (task 186).
//
// Compose-and-send tool: pick recipients from the nurse roster (search,
// select-all-filtered, manual toggles), write a subject + plain-text body,
// attach files, preview the branded email, then send one message per
// recipient. After the run a sent/failed/excluded summary is shown, and a
// History tab lists past broadcasts with per-recipient outcomes.

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone,
  Search,
  Paperclip,
  X,
  Eye,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Loader2,
} from "lucide-react";

interface RosterNurse {
  id: string;
  fullName: string;
  email: string | null;
  currentStage: string;
  hasEmail: boolean;
}

interface SendResult {
  id: string;
  sentCount: number;
  failedCount: number;
  excludedNoEmail: Array<{ nurseId: string; fullName: string }>;
  unknownIds: string[];
  results: Array<{ nurseId: string; fullName: string; email: string; status: "sent" | "failed"; error?: string }>;
}

interface HistoryRecipient {
  id: string;
  nurseId: string;
  recipientEmail: string;
  recipientName: string;
  status: string;
  error: string | null;
  sentAt: string;
}

interface HistorySend {
  id: string;
  sentBy: string;
  subject: string;
  body: string;
  attachments: Array<{ originalFilename: string; sizeBytes: number }>;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  excludedNoEmail: Array<{ nurseId: string; fullName: string }>;
  createdAt: string;
  recipients: HistoryRecipient[];
}

const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const STAGE_LABELS: Record<string, string> = {
  preboard: "Applicant",
  onboard: "Candidate",
  skills_arcade: "Skills Arcade",
  completed: "Nurse",
};

export default function MassEmailPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"compose" | "history">("compose");

  // Recipient selection
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Compose
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview / send state
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const { data: rosterData, isLoading: rosterLoading } = useQuery<{ nurses: RosterNurse[] }>({
    queryKey: ["/api/super-admin/mass-email/roster"],
  });
  const roster = rosterData?.nurses ?? [];

  const { data: historyData, isLoading: historyLoading } = useQuery<{ sends: HistorySend[] }>({
    queryKey: ["/api/super-admin/mass-email/history"],
    enabled: tab === "history",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (n) => n.fullName.toLowerCase().includes(q) || (n.email || "").toLowerCase().includes(q),
    );
  }, [roster, search]);

  const selectedNurses = roster.filter((n) => selected.has(n.id));
  const selectedWithEmail = selectedNurses.filter((n) => n.hasEmail);
  const selectedNoEmail = selectedNurses.filter((n) => !n.hasEmail);
  const totalAttachmentBytes = files.reduce((s, f) => s + f.size, 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const n of filtered) next.add(n.id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => [...prev, ...incoming].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openPreview = async () => {
    if (!body.trim()) {
      toast({ title: "Body is required", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/super-admin/mass-email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Preview failed");
      const data = await res.json();
      setPreviewHtml(data.html);
      setPreviewOpen(true);
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    }
  };

  const send = async () => {
    if (!subject.trim() || !body.trim() || selectedWithEmail.length === 0) {
      toast({
        title: "Missing details",
        description: "Subject, body and at least one recipient with an email address are required.",
        variant: "destructive",
      });
      return;
    }
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      toast({
        title: "Attachments too large",
        description: "Combined attachment size must be under 3MB.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const form = new FormData();
      form.append("subject", subject);
      form.append("body", body);
      form.append("nurseIds", JSON.stringify(Array.from(selected)));
      for (const f of files) form.append("attachments", f);
      const res = await fetch("/api/super-admin/mass-email/send", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Send failed");
      setSendResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/mass-email/history"] });
      toast({
        title: "Broadcast complete",
        description: `${data.sentCount} sent, ${data.failedCount} failed${data.excludedNoEmail.length ? `, ${data.excludedNoEmail.length} excluded (no email)` : ""}.`,
      });
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const resetCompose = () => {
    setSendResult(null);
    setSubject("");
    setBody("");
    setFiles([]);
    setSelected(new Set());
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-mass-email">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Megaphone className="h-6 w-6 text-[#C8A96E]" />
            <div>
              <h1 className="text-2xl font-semibold">Mass email</h1>
              <p className="text-sm text-muted-foreground">
                Compose and send a broadcast email to selected staff. Super-admin only.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={tab === "compose" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("compose")}
              data-testid="tab-compose"
            >
              <Send className="h-4 w-4 mr-1" /> Compose
            </Button>
            <Button
              variant={tab === "history" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("history")}
              data-testid="tab-history"
            >
              <History className="h-4 w-4 mr-1" /> History
            </Button>
          </div>
        </div>

        {tab === "compose" && sendResult && (
          <Card data-testid="card-send-result">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Broadcast summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  {sendResult.sentCount} sent
                </Badge>
                <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                  {sendResult.failedCount} failed
                </Badge>
                {sendResult.excludedNoEmail.length > 0 && (
                  <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                    {sendResult.excludedNoEmail.length} excluded (no email)
                  </Badge>
                )}
              </div>
              {sendResult.results.filter((r) => r.status === "failed").length > 0 && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-red-500">Failures</p>
                  {sendResult.results
                    .filter((r) => r.status === "failed")
                    .map((r) => (
                      <p key={r.nurseId} className="text-muted-foreground">
                        <XCircle className="inline h-3.5 w-3.5 mr-1 text-red-500" />
                        {r.fullName} ({r.email}) — {r.error}
                      </p>
                    ))}
                </div>
              )}
              {sendResult.excludedNoEmail.length > 0 && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-amber-500">Excluded — no email address on file</p>
                  {sendResult.excludedNoEmail.map((n) => (
                    <p key={n.nurseId} className="text-muted-foreground">
                      <AlertTriangle className="inline h-3.5 w-3.5 mr-1 text-amber-500" />
                      {n.fullName}
                    </p>
                  ))}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={resetCompose} data-testid="button-new-broadcast">
                New broadcast
              </Button>
            </CardContent>
          </Card>
        )}

        {tab === "compose" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recipient picker */}
            <Card data-testid="card-recipients">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Recipients{" "}
                  <Badge variant="secondary" className="ml-2" data-testid="badge-selected-count">
                    {selectedWithEmail.length} selected
                  </Badge>
                  {selectedNoEmail.length > 0 && (
                    <Badge className="ml-2 bg-amber-500/10 text-amber-500 border-amber-500/20">
                      {selectedNoEmail.length} without email — will be skipped
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or email…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                      data-testid="input-recipient-search"
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={selectAllFiltered} data-testid="button-select-all">
                    Select all{search ? " filtered" : ""}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection} data-testid="button-clear-selection">
                    Clear
                  </Button>
                </div>
                <div className="max-h-[420px] overflow-y-auto divide-y divide-border rounded border border-border">
                  {rosterLoading ? (
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No staff match your search.</p>
                  ) : (
                    filtered.map((n) => (
                      <label
                        key={n.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                        data-testid={`row-recipient-${n.id}`}
                      >
                        <Checkbox
                          checked={selected.has(n.id)}
                          onCheckedChange={() => toggle(n.id)}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{n.fullName}</span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {n.hasEmail ? n.email : "No email address on file"}
                          </span>
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {STAGE_LABELS[n.currentStage] || n.currentStage}
                        </Badge>
                        {!n.hasEmail && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                      </label>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Compose form */}
            <Card data-testid="card-compose">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Message</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject line"
                    data-testid="input-subject"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Body</label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    placeholder={"Write your message…\n\nLeave a blank line between paragraphs."}
                    data-testid="input-body"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Sent inside the standard Livaware branded email. Blank lines start new paragraphs.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Attachments</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    onChange={(e) => addFiles(e.target.files)}
                    data-testid="input-attachments"
                  />
                  <div className="space-y-2">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm border border-border rounded px-2 py-1">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                        <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={files.length >= 5}
                      data-testid="button-add-attachment"
                    >
                      <Paperclip className="h-4 w-4 mr-1" /> Add file
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Up to 5 files, 3MB combined ({formatBytes(totalAttachmentBytes)} used). PDF, images, Word.
                    </p>
                    {totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES && (
                      <p className="text-xs text-red-500">Combined attachments exceed the 3MB limit.</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={openPreview} data-testid="button-preview">
                    <Eye className="h-4 w-4 mr-1" /> Preview
                  </Button>
                  <Button
                    onClick={send}
                    disabled={sending || selectedWithEmail.length === 0 || !subject.trim() || !body.trim()}
                    data-testid="button-send"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Send to {selectedWithEmail.length} recipient{selectedWithEmail.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "history" && (
          <Card data-testid="card-history">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Past broadcasts</CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !historyData?.sends?.length ? (
                <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {historyData.sends.map((s) => (
                    <div key={s.id} className="py-3" data-testid={`row-history-${s.id}`}>
                      <button
                        className="w-full text-left flex items-center gap-3"
                        onClick={() => setExpandedHistory(expandedHistory === s.id ? null : s.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(s.createdAt).toLocaleString("en-GB")} · by {s.sentBy}
                            {s.attachments?.length ? ` · ${s.attachments.length} attachment${s.attachments.length === 1 ? "" : "s"}` : ""}
                          </p>
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          {s.sentCount} sent
                        </Badge>
                        {s.failedCount > 0 && (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                            {s.failedCount} failed
                          </Badge>
                        )}
                        {s.excludedNoEmail?.length > 0 && (
                          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                            {s.excludedNoEmail.length} excluded
                          </Badge>
                        )}
                      </button>
                      {expandedHistory === s.id && (
                        <div className="mt-3 space-y-2 text-sm">
                          <p className="text-muted-foreground whitespace-pre-line border-l-2 border-border pl-3">
                            {s.body}
                          </p>
                          {s.attachments?.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Attachments: {s.attachments.map((a) => a.originalFilename).join(", ")}
                            </p>
                          )}
                          <div className="space-y-1">
                            {s.recipients.map((r) => (
                              <p key={r.id} className="text-xs flex items-center gap-1.5">
                                {r.status === "sent" ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                                )}
                                {r.recipientName} ({r.recipientEmail})
                                {r.error ? <span className="text-red-500"> — {r.error}</span> : null}
                              </p>
                            ))}
                            {s.excludedNoEmail?.map((n) => (
                              <p key={n.nurseId} className="text-xs flex items-center gap-1.5 text-muted-foreground">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                {n.fullName} — excluded, no email address
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Preview — {subject || "(no subject)"}</DialogTitle>
            </DialogHeader>
            {previewHtml && (
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                className="w-full h-[520px] rounded border border-border bg-[#020121]"
                data-testid="iframe-preview"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
