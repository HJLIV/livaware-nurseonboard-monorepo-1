import { ComplianceMatrix } from "@/components/reports/compliance-matrix";

export default function SopComprehensionMatrixPage() {
  return (
    <ComplianceMatrix
      endpoint="/api/admin/reports/sop-comprehension-matrix"
      title="SOP Comprehension Matrix"
      description="Roll-up of every nurse's understanding check across the 14 induction SOPs. Green = passed at the current question version; amber = attempted but needs retry; red = not attempted."
      defaultDetailSection="onboarding"
      cellToTab={(key) => (key.startsWith("sop_") ? "sop_comprehension" : undefined)}
    />
  );
}
