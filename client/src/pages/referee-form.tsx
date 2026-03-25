import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, AlertTriangle, Shield, Star, Users, Loader2, FileText
} from "lucide-react";
import { REFERENCE_QUESTIONS, COMPETENCY_MATRIX } from "@shared/schema";

const RATING_LABELS = [
  { value: "1", label: "1 — Poor" },
  { value: "2", label: "2 — Below average" },
  { value: "3", label: "3 — Satisfactory" },
  { value: "4", label: "4 — Good" },
  { value: "5", label: "5 — Excellent" },
];

const COMPETENCY_LEVELS = [
  { value: "not_observed", label: "Not observed" },
  { value: "level_1", label: "Level 1 — Awareness" },
  { value: "level_2", label: "Level 2 — Foundation" },
  { value: "level_3", label: "Level 3 — Competent" },
  { value: "level_4", label: "Level 4 — Proficient" },
];

export default function RefereeFormPage() {
  const { token } = useParams<{ token: string }>();

  const { data: formData, isLoading, error } = useQuery<any>({
    queryKey: ["/api/referee", token],
    retry: false,
  });

  const [responses, setResponses] = useState<Record<string, any>>({});
  const [competencyRatings, setCompetencyRatings] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const ratings: Record<string, number> = {};
      const freeTextResponses: Record<string, string> = {};
      const conductFlags: Record<string, boolean> = {};
      let sicknessAbsenceBand = "";

      for (const q of REFERENCE_QUESTIONS) {
        const val = responses[q.key];
        if (!val && val !== false && val !== 0) continue;

        if ("type" in q && q.type === "rating") {
          ratings[q.key] = parseInt(val as string);
        } else if ("type" in q && q.type === "yesno") {
          conductFlags[q.key] = val === "yes";
        } else if ("type" in q && q.type === "select") {
          sicknessAbsenceBand = val as string;
        } else {
          freeTextResponses[q.key] = val as string;
        }
      }

      const res = await apiRequest("POST", `/api/referee/${token}/submit`, {
        ratings,
        freeTextResponses,
        conductFlags,
        sicknessAbsenceBand,
        competencyRatings,
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Reference submitted successfully" });
    },
    onError: () => {
      toast({ title: "Submission failed", description: "Please try again", variant: "destructive" });
    },
  });

  const setResponse = (key: string, value: any) => {
    setResponses(prev => ({ ...prev, [key]: value }));
  };

  const setCompetency = (comp: string, level: string) => {
    setCompetencyRatings(prev => ({ ...prev, [comp]: level }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020121] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C8A96E]" />
      </div>
    );
  }

  if (error || !formData) {
    const errorMsg = (error as any)?.message || "This reference link may have expired or already been completed.";
    return (
      <div className="min-h-screen bg-[#020121] flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-[#0a0a2e] border-[#1e1e5a]">
          <CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto" />
            <h2 className="text-lg font-semibold text-[#F0ECE4]">Reference Form Unavailable</h2>
            <p className="text-sm text-[#8A8A94]">{errorMsg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#020121] flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-[#0a0a2e] border-[#1e1e5a]">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-semibold text-[#F0ECE4]">Thank You</h2>
            <p className="text-sm text-[#8A8A94]">
              Your reference for {formData.candidateName} has been submitted successfully. Thank you for your time.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const domains = [...new Set(COMPETENCY_MATRIX.map(c => c.domain))];

  return (
    <div className="min-h-screen bg-[#020121]">
      <header className="bg-[#0a0a2e] border-b border-[#1e1e5a] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <img src="/images/livaware-logo-white.png" alt="Livaware" className="h-7 w-auto" />
          <div>
            <h1 className="text-lg font-semibold text-[#F0ECE4] font-serif">Professional Reference Form</h1>
            <p className="text-xs text-[#8A8A94] tracking-wider uppercase">Livaware Ltd — CQC Regulation 19 / Schedule 3</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <Card className="bg-[#0a0a2e] border-[#1e1e5a]">
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-sm text-[#E0DCD4]">
                Dear <strong className="text-[#F0ECE4]">{formData.refereeName}</strong>,
              </p>
              <p className="text-sm text-[#E0DCD4] leading-relaxed">
                Thank you for agreeing to provide a reference for <strong className="text-[#F0ECE4]">{formData.candidateName}</strong>.
                This form covers professional conduct, clinical ability, and competency assessment as required under CQC Regulation 19.
                Your responses will be treated as confidential.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a2e] border-[#1e1e5a]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#F0ECE4] font-serif">
              <FileText className="h-5 w-5 text-[#C8A96E]" />
              Reference Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {REFERENCE_QUESTIONS.map((q) => {
              if ("dependsOn" in q && q.dependsOn) {
                const parentVal = responses[q.dependsOn];
                if (parentVal !== "yes") return null;
              }

              return (
                <div key={q.key} className="space-y-2" data-testid={`referee-question-${q.key}`}>
                  <Label className="text-sm text-[#E0DCD4]">{q.question}</Label>

                  {"type" in q && q.type === "rating" ? (
                    <RadioGroup
                      value={responses[q.key] || ""}
                      onValueChange={(v) => setResponse(q.key, v)}
                      className="flex flex-wrap gap-2"
                    >
                      {RATING_LABELS.map(r => (
                        <div key={r.value} className="flex items-center space-x-1.5">
                          <RadioGroupItem value={r.value} id={`${q.key}-${r.value}`} />
                          <Label htmlFor={`${q.key}-${r.value}`} className="text-xs text-[#E0DCD4] cursor-pointer">{r.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : "type" in q && q.type === "yesno" ? (
                    <RadioGroup
                      value={responses[q.key] || ""}
                      onValueChange={(v) => setResponse(q.key, v)}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="yes" id={`${q.key}-yes`} />
                        <Label htmlFor={`${q.key}-yes`} className="text-sm text-[#E0DCD4] cursor-pointer">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="no" id={`${q.key}-no`} />
                        <Label htmlFor={`${q.key}-no`} className="text-sm text-[#E0DCD4] cursor-pointer">No</Label>
                      </div>
                    </RadioGroup>
                  ) : "type" in q && q.type === "select" && "options" in q ? (
                    <Select value={responses[q.key] || ""} onValueChange={(v) => setResponse(q.key, v)}>
                      <SelectTrigger className="bg-[#0d0d38] border-[#1e1e5a]">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {q.options.map((opt: string) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Textarea
                      value={responses[q.key] || ""}
                      onChange={(e) => setResponse(q.key, e.target.value)}
                      className="bg-[#0d0d38] border-[#1e1e5a] min-h-[60px]"
                      placeholder="Your response..."
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a2e] border-[#1e1e5a]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#F0ECE4] font-serif">
              <Star className="h-5 w-5 text-[#C8A96E]" />
              Clinical Competency Assessment
            </CardTitle>
            <p className="text-sm text-[#8A8A94] mt-1">
              Based on your observation, please rate the candidate's competency level for the following clinical skills. Select "Not observed" if you have not seen them perform this skill.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {domains.map(domain => {
              const domainComps = COMPETENCY_MATRIX.filter(c => c.domain === domain);
              return (
                <div key={domain} className="space-y-3">
                  <h3 className="text-sm font-semibold text-[#C8A96E] tracking-wider uppercase">{domain}</h3>
                  <div className="space-y-3">
                    {domainComps.map(comp => (
                      <div key={comp.competency} className="rounded-md border border-[#1e1e5a] p-3 space-y-2" data-testid={`competency-${comp.competency.substring(0, 20)}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-[#E0DCD4]">{comp.competency}</span>
                          {comp.mandatory && (
                            <Badge variant="outline" className="text-[10px] border-[#C8A96E]/30 text-[#C8A96E]">Required</Badge>
                          )}
                        </div>
                        <Select
                          value={competencyRatings[comp.competency] || ""}
                          onValueChange={(v) => setCompetency(comp.competency, v)}
                        >
                          <SelectTrigger className="bg-[#0d0d38] border-[#1e1e5a] h-9 text-xs">
                            <SelectValue placeholder="Select competency level..." />
                          </SelectTrigger>
                          <SelectContent>
                            {COMPETENCY_LEVELS.map(l => (
                              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a2e] border-[#1e1e5a]">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="bg-[#0d0d38] border-l-3 border-[#C8A96E] p-4 rounded-r-md">
                <p className="text-xs text-[#8A8A94] leading-relaxed">
                  By submitting this form, I confirm that the information provided is accurate and given in good faith.
                  I understand that the information will be treated as confidential and used solely for the purposes of
                  pre-employment screening under CQC Regulation 19 (Schedule 3).
                </p>
              </div>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="w-full bg-gradient-to-r from-[#C8A96E] to-[#b8944e] text-[#020121] font-semibold hover:opacity-90"
                data-testid="button-submit-reference"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Reference"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <footer className="text-center pb-8">
          <p className="text-xs text-[#8A8A94]">
            Livaware Ltd — Secure Nurse Onboarding &middot; CQC Regulation 19 / Schedule 3 Compliant
          </p>
        </footer>
      </main>
    </div>
  );
}
