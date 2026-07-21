import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Link2, Link2Off, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  DEFAULT_24H_SLOTS,
  DEFAULT_TIMED_VISIT_SLOTS,
  type CarePattern,
  type RosterSlot,
} from "@shared/schema";

interface Patient {
  id: string;
  name: string;
  carePattern: CarePattern;
  engagementStart: string | null;
  engagementEnd: string | null;
  notes: string | null;
  active: boolean;
  slots: RosterSlot[];
  sembleId: string | null;
  dob: string | null;
  email: string | null;
  phone: string | null;
}

interface SemblePatientHit {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  dob: string | null;
  email: string | null;
  phones: { phoneType: string | null; phoneNumber: string | null }[] | null;
}

const EMPTY_FORM = {
  name: "",
  carePattern: "twenty_four_hour" as CarePattern,
  engagementStart: "",
  engagementEnd: "",
  notes: "",
  active: true,
  slots: DEFAULT_24H_SLOTS as RosterSlot[],
  sembleId: "",
  dob: "",
  email: "",
  phone: "",
};

type FormState = typeof EMPTY_FORM;

function SembleLinkSection({
  form, setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const { data: status } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/admin/semble/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/semble/status");
      return res.json();
    },
  });

  const { data: results, isFetching, error } = useQuery<{ patients: SemblePatientHit[]; hasMore: boolean }>({
    queryKey: ["/api/admin/semble/patients", submittedSearch],
    enabled: !!status?.configured && submittedSearch.length >= 2,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/semble/patients?search=${encodeURIComponent(submittedSearch)}`);
      return res.json();
    },
  });

  const pick = (p: SemblePatientHit) => {
    const phone = p.phones?.find((x) => x.phoneNumber)?.phoneNumber || "";
    setForm((f) => ({
      ...f,
      name: f.name.trim() || p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" "),
      sembleId: p.id,
      dob: p.dob || "",
      email: p.email || "",
      phone,
    }));
    setSearch("");
    setSubmittedSearch("");
  };

  const unlink = () => setForm((f) => ({ ...f, sembleId: "", dob: "", email: "", phone: "" }));

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5" /> Semble patient link
      </Label>
      {form.sembleId ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" data-testid="badge-semble-linked">Linked to Semble</Badge>
            <Button type="button" variant="ghost" size="sm" onClick={unlink} data-testid="button-semble-unlink">
              <Link2Off className="h-3.5 w-3.5 mr-1" /> Unlink
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div className="font-mono">{form.sembleId}</div>
            {form.dob && <div>DOB: {form.dob.slice(0, 10)}</div>}
            {form.email && <div>{form.email}</div>}
            {form.phone && <div>{form.phone}</div>}
          </div>
        </div>
      ) : status?.configured ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search Semble by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSubmittedSearch(search.trim());
                }
              }}
              data-testid="input-semble-search"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={search.trim().length < 2 || isFetching}
              onClick={() => setSubmittedSearch(search.trim())}
              data-testid="button-semble-search"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {!!error && (
            <p className="text-xs text-destructive">Semble search failed: {(error as any)?.message || "unknown error"}</p>
          )}
          {results && results.patients.length === 0 && (
            <p className="text-xs text-muted-foreground">No Semble patients matched "{submittedSearch}".</p>
          )}
          {results && results.patients.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
              {results.patients.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover-elevate"
                  onClick={() => pick(p)}
                  data-testid={`semble-result-${p.id}`}
                >
                  <div className="font-medium">{p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {[p.dob ? `DOB ${p.dob.slice(0, 10)}` : null, p.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              ))}
              {results.hasMore && (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">More matches exist — refine the search.</div>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Linking pushes this patient's roster allocations to the Semble diary automatically.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Semble is not configured. Set the API token in platform settings to search and link patients.
        </p>
      )}
    </div>
  );
}

function PatientDialog({
  open, onClose, initial, patientId,
}: {
  open: boolean;
  onClose: () => void;
  initial: FormState;
  patientId: string | null;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initial);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        carePattern: form.carePattern,
        engagementStart: form.engagementStart || undefined,
        engagementEnd: form.engagementEnd || undefined,
        notes: form.notes.trim() || undefined,
        active: form.active,
        slots: form.slots,
        sembleId: form.sembleId || null,
        dob: form.dob || null,
        email: form.email || null,
        phone: form.phone || null,
      };
      const res = patientId
        ? await apiRequest("PUT", `/api/admin/rostering/patients/${patientId}`, body)
        : await apiRequest("POST", `/api/admin/rostering/patients`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/patients"] });
      toast({ title: patientId ? "Patient updated" : "Patient created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const setSlot = (i: number, patch: Partial<RosterSlot>) => {
    setForm((f) => ({ ...f, slots: f.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  };
  const addSlot = () => {
    setForm((f) => ({
      ...f,
      slots: [...f.slots, { key: `visit${f.slots.length + 1}`, label: `Visit ${f.slots.length + 1}`, startTime: "09:00", endTime: "10:00" }],
    }));
  };
  const removeSlot = (i: number) => setForm((f) => ({ ...f, slots: f.slots.filter((_, j) => j !== i) }));

  const onPatternChange = (v: CarePattern) => {
    setForm((f) => ({
      ...f,
      carePattern: v,
      slots: (v === "twenty_four_hour" ? DEFAULT_24H_SLOTS : DEFAULT_TIMED_VISIT_SLOTS) as RosterSlot[],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-light">
            {patientId ? "Edit patient" : "New patient"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Patient name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-patient-name" />
          </div>
          <SembleLinkSection form={form} setForm={setForm} />
          <div className="space-y-1.5">
            <Label>Care pattern</Label>
            <Select value={form.carePattern} onValueChange={(v) => onPatternChange(v as CarePattern)}>
              <SelectTrigger data-testid="select-care-pattern"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="twenty_four_hour">24-hour care (Day + Night)</SelectItem>
                <SelectItem value="timed_visits">Timed visits (up to 3/day)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Engagement start</Label>
              <Input type="date" value={form.engagementStart} onChange={(e) => setForm({ ...form, engagementStart: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Engagement end</Label>
              <Input type="date" value={form.engagementEnd} onChange={(e) => setForm({ ...form, engagementEnd: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {form.carePattern === "twenty_four_hour" ? "Shifts (exactly 2)" : "Visits (1–3 per day)"}
              </Label>
              {form.carePattern === "timed_visits" && form.slots.length < 3 && (
                <Button type="button" variant="outline" size="sm" onClick={addSlot}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add visit
                </Button>
              )}
            </div>
            {form.slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={s.label}
                  onChange={(e) => setSlot(i, { label: e.target.value })}
                  placeholder="Label"
                />
                <Input type="time" className="w-28" value={s.startTime} onChange={(e) => setSlot(i, { startTime: e.target.value })} />
                <span className="text-muted-foreground text-xs">to</span>
                <Input type="time" className="w-28" value={s.endTime} onChange={(e) => setSlot(i, { endTime: e.target.value })} />
                {form.carePattern === "timed_visits" && form.slots.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSlot(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {form.carePattern === "twenty_four_hour"
                ? "A shift ending at or before its start time runs into the next day (e.g. 20:00–08:00)."
                : "Each visit needs a start and end time on the same day."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name.trim() || form.slots.length === 0}
            data-testid="button-save-patient"
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {patientId ? "Save changes" : "Create patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RosteringPatientsPage() {
  const { toast } = useToast();
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; patientId: string | null; initial: FormState } | null>(null);

  const { data, isLoading } = useQuery<Patient[]>({
    queryKey: ["/api/admin/rostering/patients", showInactive],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/rostering/patients${showInactive ? "?includeInactive=1" : ""}`);
      return res.json();
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/rostering/patients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/patients"] });
      toast({ title: "Patient deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const openNew = () => setDialog({ open: true, patientId: null, initial: { ...EMPTY_FORM, slots: DEFAULT_24H_SLOTS as RosterSlot[] } });
  const openEdit = (p: Patient) =>
    setDialog({
      open: true,
      patientId: p.id,
      initial: {
        name: p.name,
        carePattern: p.carePattern,
        engagementStart: p.engagementStart || "",
        engagementEnd: p.engagementEnd || "",
        notes: p.notes || "",
        active: p.active,
        slots: p.slots,
        sembleId: p.sembleId || "",
        dob: p.dob || "",
        email: p.email || "",
        phone: p.phone || "",
      },
    });

  return (
    <div className="p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Rostering</p>
          <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="heading-patients">Patients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Care packages and their daily shift or visit structure. Open a patient to build their rota.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
          </div>
          <Button onClick={openNew} data-testid="button-new-patient">
            <Plus className="h-4 w-4 mr-2" /> New patient
          </Button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-48 w-full" />}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No patients yet. Create the first care package to start rostering.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} className={!p.active ? "opacity-60" : undefined} data-testid={`card-patient-${p.id}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-serif text-lg font-light truncate">{p.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary">
                      {p.carePattern === "twenty_four_hour" ? "24-hour care" : "Timed visits"}
                    </Badge>
                    {p.sembleId && (
                      <Badge variant="outline" className="gap-1" data-testid={`badge-semble-${p.id}`}>
                        <Link2 className="h-3 w-3" /> Semble
                      </Badge>
                    )}
                    {!p.active && <Badge variant="outline">Inactive</Badge>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`button-edit-${p.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete ${p.name} and their roster? This cannot be undone.`)) del.mutate(p.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {p.slots.map((s) => (
                  <div key={s.key}>{s.label}: {s.startTime}–{s.endTime}</div>
                ))}
                {(p.engagementStart || p.engagementEnd) && (
                  <div>Engagement: {p.engagementStart || "…"} → {p.engagementEnd || "ongoing"}</div>
                )}
              </div>
              <Link href={`/rostering/patients/${p.id}`}>
                <Button variant="outline" size="sm" className="w-full" data-testid={`button-roster-${p.id}`}>
                  <CalendarDays className="h-3.5 w-3.5 mr-2" /> Open roster
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {dialog?.open && (
        <PatientDialog
          open
          onClose={() => setDialog(null)}
          initial={dialog.initial}
          patientId={dialog.patientId}
        />
      )}
    </div>
  );
}
