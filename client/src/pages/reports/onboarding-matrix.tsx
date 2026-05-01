import { ComplianceMatrix } from "@/components/reports/compliance-matrix";

const DOC_KEY_TO_TAB: Record<string, string> = {
  doc_passport: "identity",
  doc_proof_of_address: "identity",
  doc_right_to_work: "right_to_work",
  doc_nmc_register_check: "nmc",
  doc_dbs_certificate: "dbs",
  doc_cv: "profile",
  doc_professional_indemnity: "indemnity",
  doc_health_declaration: "health",
  doc_induction_policy_acknowledgment: "induction",
};

const PROFILE_KEY_TO_TAB: Record<string, string> = {
  profile_fullName: "identity",
  profile_email: "identity",
  profile_phone: "identity",
  profile_dateOfBirth: "identity",
  profile_address: "identity",
  profile_nextOfKin: "identity",
  profile_passportPhoto: "identity",
  profile_nmcPin: "nmc",
  profile_dbsNumber: "dbs",
  profile_band: "profile",
  profile_specialisms: "profile",
};

export default function OnboardingMatrixPage() {
  return (
    <ComplianceMatrix
      endpoint="/api/admin/reports/onboarding-matrix"
      title="Onboarding & Documents Matrix"
      description="Whole-roster view of personal info completeness and core onboarding documents. Click any cell to jump straight to that step on the candidate's profile."
      defaultDetailSection="onboarding"
      cellToTab={(key) => DOC_KEY_TO_TAB[key] ?? PROFILE_KEY_TO_TAB[key]}
      cellToSection={(key) =>
        key === "doc_induction_policy_acknowledgment" ? "compliance" : undefined
      }
    />
  );
}
