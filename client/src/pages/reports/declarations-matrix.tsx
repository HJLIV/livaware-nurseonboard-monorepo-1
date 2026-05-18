import { ComplianceMatrix } from "@/components/reports/compliance-matrix";

export default function DeclarationsMatrixPage() {
  return (
    <ComplianceMatrix
      endpoint="/api/admin/reports/declarations-matrix"
      title="Declarations Matrix"
      description="One row per nurse, one column per onboarding declaration. Green = signed and submitted. Amber = started but not yet signed (draft or re-opened). Red = not yet started."
      defaultDetailSection="compliance"
    />
  );
}
