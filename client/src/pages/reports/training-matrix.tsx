import { ComplianceMatrix } from "@/components/reports/compliance-matrix";

export default function TrainingMatrixPage() {
  return (
    <ComplianceMatrix
      endpoint="/api/admin/reports/training-matrix"
      title="Mandatory Training Matrix"
      description="One row per candidate, one column per CSTF mandatory training module. Amber if the certificate expires within 30 days, red if expired or missing."
      defaultDetailSection="compliance"
      cellToTab={() => "training_compliance"}
    />
  );
}
