import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Search, Users, ArrowUpRight, Mail, Calendar } from "lucide-react";

interface Nurse {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  currentStage: string;
  preboardStatus: string;
  onboardStatus: string;
  arcadeStatus: string;
  createdAt: string;
}

const stageConfig: Record<string, { bg: string; text: string; dot: string }> = {
  preboard:       { bg: "bg-blue-500/8",    text: "text-blue-400",    dot: "bg-blue-400" },
  onboard:        { bg: "bg-emerald-500/8",  text: "text-emerald-400", dot: "bg-emerald-400" },
  "skills-arcade": { bg: "bg-amber-500/8",   text: "text-amber-400",   dot: "bg-amber-400" },
  completed:      { bg: "bg-primary/8",      text: "text-primary",     dot: "bg-primary" },
};

function RegisterNurseDialog() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/nurses", { firstName, lastName, email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      toast({ title: "Nurse registered", description: `${firstName} ${lastName} has been added to the platform.` });
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    registerMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-semibold shadow-md">
          <UserPlus className="h-4 w-4" />
          Register Nurse
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-light">Register New Nurse</DialogTitle>
          <DialogDescription>Add a new nurse to the platform. They will begin at the Preboard stage.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">First Name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last Name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="h-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane.doe@example.com" className="h-10" />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={registerMutation.isPending || !firstName.trim() || !lastName.trim() || !email.trim()} className="gap-2">
              {registerMutation.isPending ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : "Register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NurseCard({ nurse, onClick, index }: { nurse: Nurse; onClick: () => void; index: number }) {
  const stage = stageConfig[nurse.currentStage] || stageConfig.preboard;
  const initials = `${nurse.firstName?.[0] || ""}${nurse.lastName?.[0] || ""}`.toUpperCase();

  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      <Card
        className="group relative overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
        onClick={onClick}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${stage.bg} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 text-sm font-bold text-primary">
              {initials}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {nurse.firstName} {nurse.lastName}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground truncate">{nurse.email}</span>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${stage.bg}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${stage.text}`}>{nurse.currentStage}</span>
                </div>
                <StatusBadge status={nurse.preboardStatus} />
                <StatusBadge status={nurse.onboardStatus} />
                <StatusBadge status={nurse.arcadeStatus} />
              </div>

              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                <Calendar className="h-2.5 w-2.5" />
                {new Date(nurse.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NursesPage() {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

  const { data: nurses, isLoading } = useQuery<Nurse[]>({
    queryKey: ["/api/nurses"],
  });

  const filtered = nurses?.filter((nurse) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      nurse.firstName.toLowerCase().includes(q) ||
      nurse.lastName.toLowerCase().includes(q) ||
      nurse.email.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="flex items-end justify-between animate-fade-in-up">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
              Onboard
            </p>
            <h1 className="font-serif text-3xl font-light tracking-tight text-foreground">
              Nurses
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage registrations and lifecycle progress
            </p>
          </div>
          <RegisterNurseDialog />
        </div>

        <div className="flex items-center gap-4 animate-fade-in-up animate-delay-100">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60"
            />
          </div>
          {nurses && (
            <Badge variant="secondary" className="shrink-0 font-semibold tabular-nums">
              {filtered?.length ?? 0} of {nurses.length}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((nurse, i) => (
              <NurseCard
                key={nurse.id}
                nurse={nurse}
                onClick={() => setLocation(`/nurses/${nurse.id}`)}
                index={i}
              />
            ))}
          </div>
        ) : (
          <Card className="animate-fade-in-up">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                <Users className="h-7 w-7 text-primary/40" />
              </div>
              <p className="font-serif text-lg text-foreground mb-1">
                {search ? "No nurses found" : "No nurses registered"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {search ? "Try adjusting your search terms" : "Register your first nurse to begin their onboarding journey"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
