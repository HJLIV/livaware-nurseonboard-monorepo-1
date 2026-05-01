import { ComplianceMatrix } from "@/components/reports/compliance-matrix";

export default function CompetencyMatrixPage() {
  return (
    <ComplianceMatrix
      endpoint="/api/admin/reports/competency-matrix"
      title="Competency & Skills Arcade Matrix"
      description="Roll-up of self-assessed competency declarations by domain plus per-module Skills Arcade clearance. Green = approved at or above the minimum band level; amber = under review or below minimum; red = mandatory not met or flagged."
      defaultDetailSection="onboarding"
      cellToTab={(key) => (key.startsWith("dom_") ? "competency" : undefined)}
    />
  );
}
