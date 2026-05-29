import { ComplianceMatrix } from "@/components/reports/compliance-matrix";

// Roster-wide internal-training completion matrix. One row per nurse, one
// column per fixed internal training. A green cell links straight to the
// uploaded certificate (download); grey means nothing uploaded yet.
export default function InternalTrainingMatrixPage() {
  return (
    <ComplianceMatrix
      endpoint="/api/admin/reports/internal-training-matrix"
      title="Internal Training Matrix"
      description="One row per nurse, one column per internal training. Green means a certificate has been uploaded — click the cell to download it. Grey means it has not been uploaded yet."
      defaultDetailSection="onboarding"
    />
  );
}
