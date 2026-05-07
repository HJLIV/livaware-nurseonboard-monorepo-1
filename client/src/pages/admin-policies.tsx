// Admin page for managing the master list of policies that nurses must
// read & sign in the portal. Supports create / edit / delete / toggle
// active and viewing the per-policy acknowledgement audit list.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Plus, Pencil, Trash2, Users, FileText, Loader2 } from "lucide-react";

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
  const [editing, setEditing] = useState<Policy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [viewingAcks, setViewingAcks] = useState<Policy | null>(null);

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/admin/policies"],
  });

  const { data: acknowledgements } = useQuery<Acknowledgement[]>({
    queryKey: [`/api/admin/policies/${viewingAcks?.id}/acknowledgements`],
    enabled: !!viewingAcks,
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
        <Button onClick={openCreate} data-testid="button-new-policy">
          <Plus className="h-4 w-4 mr-1.5" />
          New Policy
        </Button>
      </div>

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
              <Textarea
                id="policy-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="The full text of the policy. Plain text or markdown-ish."
                rows={10}
                data-testid="input-policy-body"
              />
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nurse ID</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Acknowledged</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acknowledgements.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.nurseId.slice(0, 8)}…</TableCell>
                    <TableCell>v{a.policyVersion}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(a.acknowledgedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.ipAddress || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
