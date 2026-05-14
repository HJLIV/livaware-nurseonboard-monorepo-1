import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

export function StageLockedCard({ label }: { label: string }) {
  return (
    <Card data-testid="portal-stage-locked">
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <Lock className="h-8 w-8 text-muted-foreground/50" />
        <h2 className="font-serif text-2xl font-light tracking-tight">
          {label} is not yet available
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          You'll get access to this section once your employer has reviewed
          and approved your compliance file. Until then, please continue
          working through your Compliance questionnaires and uploads.
        </p>
      </CardContent>
    </Card>
  );
}
