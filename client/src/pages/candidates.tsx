import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import { StepProgress } from "@/components/shared/step-progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ArrowRight, UserCircle, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Candidate, OnboardingState } from "@shared/schema";

function AddCandidateDialog() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [band, setBand] = useState("5");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/candidates", {
        fullName,
        email,
        phone,
        band: parseInt(band),
        status: "application",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setOpen(false);
      setFullName("");
      setEmail("");
      setPhone("");
      toast({
        title: "Candidate added",
        description: data.emailSent
          ? "Portal invite email sent to " + data.email
          : "Candidate registered. Portal invite email could not be sent.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-candidate">
          <Plus className="h-4 w-4 mr-2" />
          Add Candidate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register New Candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Sarah Mitchell"
              data-testid="input-candidate-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. sarah@nhs.net"
              data-testid="input-candidate-email"
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 07712345678"
              data-testid="input-candidate-phone"
            />
          </div>
          <div className="space-y-2">
            <Label>Band</Label>
            <Select value={band} onValueChange={setBand}>
              <SelectTrigger data-testid="select-band">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Band 5</SelectItem>
                <SelectItem value="6">Band 6</SelectItem>
                <SelectItem value="7">Band 7</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={!fullName || !email || createMutation.isPending}
            data-testid="button-submit-candidate"
          >
            {createMutation.isPending ? "Registering..." : "Register Candidate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRowSkeleton() {
  return (
    <Card className="border border-card-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="hidden lg:block h-3 w-80" />
          <Skeleton className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function CandidatesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: candidates, isLoading } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"] });

  const filtered = (candidates || []).filter(c => {
    const matchesSearch = c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.nmcPin?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between animate-fade-slide-up stagger-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Candidates</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage nurse onboarding applications</p>
          </div>
          <AddCandidateDialog />
        </div>

        <div className="flex items-center gap-3 animate-fade-slide-up stagger-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or NMC PIN..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-candidates"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="application">Application</SelectItem>
              <SelectItem value="verification">Verification</SelectItem>
              <SelectItem value="competency">Competency</SelectItem>
              <SelectItem value="references">References</SelectItem>
              <SelectItem value="induction">Induction</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <CandidateRowSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border border-card-border animate-scale-in">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                {search || statusFilter !== "all" ? (
                  <Search className="h-7 w-7 text-muted-foreground" />
                ) : (
                  <UserPlus className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <p className="text-base font-medium text-foreground">
                {search || statusFilter !== "all" ? "No matching candidates" : "No candidates yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-[280px] text-center">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search terms or clearing filters"
                  : "Register your first nurse candidate to begin the onboarding process"}
              </p>
              {!(search || statusFilter !== "all") && (
                <AddCandidateDialog />
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((candidate, index) => (
              <div key={candidate.id} className={`animate-fade-slide-up stagger-${Math.min(index + 1, 6)}`}>
                <CandidateRow candidate={candidate} />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const { data: state } = useQuery<OnboardingState>({
    queryKey: ["/api/candidates", candidate.id, "onboarding-state"],
  });

  return (
    <Link href={`/candidates/${candidate.id}`}>
      <Card className="border border-card-border cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all duration-200" data-testid={`candidate-row-${candidate.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
              {candidate.fullName.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-foreground">{candidate.fullName}</p>
                <StatusBadge status={candidate.status} />
                {candidate.band && (
                  <Badge variant="outline" className="text-xs">Band {candidate.band}</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{candidate.email}</span>
                {candidate.nmcPin && <span>NMC: {candidate.nmcPin}</span>}
                {candidate.specialisms && candidate.specialisms.length > 0 && (
                  <span>{candidate.specialisms.join(", ")}</span>
                )}
              </div>
            </div>
            <div className="hidden lg:block w-80">
              {state?.stepStatuses != null && (
                <StepProgress
                  stepStatuses={state.stepStatuses as Record<string, string>}
                  currentStep={state.currentStep}
                  compact
                />
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
