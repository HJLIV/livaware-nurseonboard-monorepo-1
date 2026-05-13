// Task 114: Aligns arcade modules with the Staff-Handbook SOPs they
// teach. Run on boot. Only patches modules whose `sopRefs` is currently
// null/empty so admin edits are preserved.
//
// Refs use the same `induction:sop-NN-...` slugs that the handbook
// seeder writes to the `policies` table (see server/induction-content.ts),
// so an arcade walkthrough can deep-link straight back to the SOP the
// nurse just read & acknowledged.
//
// Handbook v1.0 SOP catalogue (kept here for reviewer context):
//   sop-01-antt              — Aseptic Non-Touch Technique
//   sop-02-venepuncture      — Venepuncture for blood sampling
//   sop-03-peripheral-iv     — Peripheral IV (butterfly) infusion
//   sop-04-picc              — IV infusion via PICC line
//   sop-05-port              — IV infusion via implanted port (TIVAD)
//   sop-06-sharps            — Sharps injury / body-fluid exposure
//   sop-07-documentation     — Defensible documentation for procedures
//   sop-08-deterioration     — Acute deterioration & emergencies (NEWS2)
//   sop-09-cold-chain        — Cold chain & temperature for medicines
//   sop-10-safeguarding      — Safeguarding adults & children
//   sop-11-consent           — Consent, capacity, best-interests
//   sop-12-medicines         — Medicines admin & infusion safety checks
//   sop-13-handover-sbar     — Clinical handover & SBAR
//   sop-14-complaints        — Concerns, complaints & feedback

import { db } from "./db";
import { arcadeModules } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const SOP_REFS_BY_MODULE_NAME: Record<string, string[]> = {
  "SC Injection Technique": ["induction:sop-01-antt", "induction:sop-12-medicines"],
  "SC Medication Administration": ["induction:sop-12-medicines"],
  "Insulin Administration": ["induction:sop-12-medicines"],
  "Hypoglycaemia Management": ["induction:sop-08-deterioration", "induction:sop-12-medicines"],
  "Medication Reconciliation": ["induction:sop-12-medicines", "induction:sop-07-documentation"],
  "Controlled Drug Administration": ["induction:sop-12-medicines", "induction:sop-07-documentation"],
  "Syringe Driver Setup": ["induction:sop-12-medicines", "induction:sop-01-antt"],
  "Syringe Driver Monitoring": ["induction:sop-12-medicines"],
  "Anticipatory Prescribing": ["induction:sop-12-medicines"],
  "Verification of Expected Death": ["induction:sop-07-documentation"],
  "Palliative Symptom Assessment": ["induction:sop-08-deterioration"],
  "IV Drip Rate Calculation": ["induction:sop-12-medicines", "induction:sop-03-peripheral-iv"],
  "IV Troubleshooting": ["induction:sop-03-peripheral-iv", "induction:sop-04-picc"],
  "Central Line Access": ["induction:sop-04-picc", "induction:sop-05-port", "induction:sop-01-antt"],
  "Wound Dressing Change": ["induction:sop-01-antt"],
  "Pressure Ulcer Assessment": ["induction:sop-07-documentation"],
  "Compression Bandaging": ["induction:sop-01-antt"],
  "Skin Tear Management": ["induction:sop-01-antt"],
  "Urinary Catheterisation": ["induction:sop-01-antt"],
  "Catheter Maintenance": ["induction:sop-01-antt"],
  "Suprapubic Catheter Care": ["induction:sop-01-antt"],
  "Tracheostomy Care": ["induction:sop-01-antt", "induction:sop-08-deterioration"],
  "Bowel Management": ["induction:sop-07-documentation"],
  "Venipuncture": ["induction:sop-02-venepuncture", "induction:sop-06-sharps"],
  "PEG/NG Tube Feeding": ["induction:sop-01-antt", "induction:sop-12-medicines"],
  "Oxygen Therapy": ["induction:sop-08-deterioration"],
  "Nebuliser Therapy": ["induction:sop-12-medicines"],
  "Peak Flow & Inhaler Technique": ["induction:sop-12-medicines"],
  "Blood Glucose Monitoring": ["induction:sop-07-documentation"],
  "Diabetic Foot Assessment": ["induction:sop-07-documentation"],
  "Nutritional Screening (MUST)": ["induction:sop-07-documentation"],
  "Fluid Balance Monitoring": ["induction:sop-07-documentation", "induction:sop-08-deterioration"],
};

export async function reconcileArcadeSopRefs(): Promise<{ patched: number }> {
  const all = await db.select().from(arcadeModules);
  let patched = 0;
  for (const mod of all) {
    const refs = SOP_REFS_BY_MODULE_NAME[mod.name];
    if (!refs || refs.length === 0) continue;
    const current = (mod.sopRefs as string[] | null) ?? [];
    if (current.length > 0) continue; // respect admin edits
    await db
      .update(arcadeModules)
      .set({ sopRefs: sql`${JSON.stringify(refs)}::jsonb` })
      .where(eq(arcadeModules.id, mod.id));
    patched += 1;
  }
  return { patched };
}
