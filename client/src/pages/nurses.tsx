import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Search, Users } from "lucide-react";

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

function RegisterNurseDialog() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/nurses", {
        firstName,
        lastName,
        email,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      toast({
        title: "Nurse registered",
        description: `${firstName} ${lastName} has been added to the platform.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
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
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Register Nurse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register New Nurse</DialogTitle>
          <DialogDescription>
            Add a new nurse to the Livaware platform. They will begin at the
            Preboard stage.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane.doe@example.com"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                registerMutation.isPending ||
                !firstName.trim() ||
                !lastName.trim() ||
                !email.trim()
              }
            >
              {registerMutation.isPending ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                "Register"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nurses</h1>
            <p className="text-muted-foreground">
              Manage nurse registrations and lifecycle progress
            </p>
          </div>
          <RegisterNurseDialog />
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search nurses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered && filtered.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Preboard</TableHead>
                    <TableHead>Onboard</TableHead>
                    <TableHead>Arcade</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((nurse) => (
                    <TableRow
                      key={nurse.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setLocation(`/nurses/${nurse.id}`)}
                    >
                      <TableCell className="font-medium">
                        {nurse.firstName} {nurse.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {nurse.email}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={nurse.currentStage} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={nurse.preboardStatus} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={nurse.onboardStatus} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={nurse.arcadeStatus} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(nurse.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  {search ? "No nurses match your search" : "No nurses registered yet"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search
                    ? "Try adjusting your search terms"
                    : "Register your first nurse to get started"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
