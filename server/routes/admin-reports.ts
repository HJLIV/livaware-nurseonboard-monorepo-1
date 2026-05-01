import type { Express } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  arcadeUsers,
  arcadeModules,
  assignments,
  attempts,
  clearances,
  MANDATORY_TRAINING_MODULES,
  COMPETENCY_MATRIX,
} from "@shared/schema";
import { storage } from "../storage";
import { requireAdmin } from "../middleware";

type CellStatus = "green" | "amber" | "red" | "grey";

interface MatrixCell {
  status: CellStatus;
  label: string;
  date?: string | null;
}

interface MatrixCandidate {
  id: string;
  name: string;
  email: string;
  band: number | null;
  onboardStatus: string | null;
  cells: Record<string, MatrixCell>;
}

interface MatrixColumn {
  key: string;
  label: string;
  group?: string;
}

interface MatrixResponse {
  generatedAt: string;
  columns: MatrixColumn[];
  candidates: MatrixCandidate[];
}

const ONBOARDING_DOCUMENT_COLUMNS: MatrixColumn[] = [
  { key: "doc_passport", label: "Passport", group: "Identity" },
  { key: "doc_proof_of_address", label: "Proof of Address", group: "Identity" },
  { key: "doc_right_to_work", label: "Right to Work", group: "Identity" },
  { key: "doc_nmc_register_check", label: "NMC Register Check", group: "Professional" },
  { key: "doc_dbs_certificate", label: "DBS Certificate", group: "Professional" },
  { key: "doc_cv", label: "CV", group: "Professional" },
  { key: "doc_professional_indemnity", label: "Indemnity Cert", group: "Professional" },
  { key: "doc_health_declaration", label: "Health Declaration", group: "Compliance" },
  { key: "doc_induction_policy_acknowledgment", label: "Induction Policies", group: "Compliance" },
];

const ONBOARDING_PROFILE_COLUMNS: MatrixColumn[] = [
  { key: "profile_fullName", label: "Full Name", group: "Personal Info" },
  { key: "profile_email", label: "Email", group: "Personal Info" },
  { key: "profile_phone", label: "Phone", group: "Personal Info" },
  { key: "profile_dateOfBirth", label: "Date of Birth", group: "Personal Info" },
  { key: "profile_address", label: "Address", group: "Personal Info" },
  { key: "profile_nextOfKin", label: "Next of Kin", group: "Personal Info" },
  { key: "profile_passportPhoto", label: "Passport Photo", group: "Personal Info" },
  { key: "profile_nmcPin", label: "NMC PIN", group: "Professional Info" },
  { key: "profile_dbsNumber", label: "DBS Number", group: "Professional Info" },
  { key: "profile_band", label: "Band", group: "Professional Info" },
  { key: "profile_specialisms", label: "Specialisms", group: "Professional Info" },
];

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function profileCell(value: unknown): MatrixCell {
  const present =
    value !== null &&
    value !== undefined &&
    value !== "" &&
    !(Array.isArray(value) && value.length === 0);
  return present
    ? { status: "green", label: "Provided" }
    : { status: "red", label: "Missing" };
}

function documentCell(docs: { aiStatus?: string | null; expiryDate?: string | null }[]): MatrixCell {
  if (!docs || docs.length === 0) {
    return { status: "red", label: "Missing" };
  }
  const sorted = [...docs].sort((a, b) => {
    const da = daysUntil(a.expiryDate ?? undefined);
    const db_ = daysUntil(b.expiryDate ?? undefined);
    if (da === null && db_ === null) return 0;
    if (da === null) return -1;
    if (db_ === null) return 1;
    return db_ - da;
  });
  const best = sorted[0];
  const days = daysUntil(best.expiryDate ?? undefined);
  if (days !== null && days < 0) {
    return { status: "red", label: `Expired ${formatDate(best.expiryDate)}`, date: best.expiryDate };
  }
  if (days !== null && days <= 30) {
    return { status: "amber", label: `Expires ${formatDate(best.expiryDate)}`, date: best.expiryDate };
  }
  if (best.aiStatus === "issues_found") {
    return { status: "amber", label: "Issues found" };
  }
  if (best.aiStatus === "pending" || !best.aiStatus) {
    return { status: best.expiryDate ? "green" : "amber", label: best.expiryDate ? "Verified" : "Uploaded" };
  }
  return { status: "green", label: "Verified", date: best.expiryDate ?? null };
}

export function registerAdminReportsRoutes(app: Express) {
  // ==================== ONBOARDING & DOCUMENTS MATRIX ====================
  app.get("/api/admin/reports/onboarding-matrix", requireAdmin, async (_req, res) => {
    try {
      const [
        candidates,
        documents,
        professionalIndemnityRows,
        healthDeclarationRows,
        inductionPolicyRows,
      ] = await Promise.all([
        storage.getCandidates(),
        storage.getAllDocuments(),
        storage.getAllProfessionalIndemnity(),
        storage.getAllHealthDeclarations(),
        storage.getAllInductionPolicies(),
      ]);

      const docsByNurse = new Map<string, typeof documents>();
      for (const d of documents) {
        const list = docsByNurse.get(d.nurseId) ?? [];
        list.push(d);
        docsByNurse.set(d.nurseId, list);
      }

      const indemnityByNurse = new Map<string, (typeof professionalIndemnityRows)[number]>();
      for (const i of professionalIndemnityRows) indemnityByNurse.set(i.nurseId, i);

      const healthByNurse = new Map<string, (typeof healthDeclarationRows)[number]>();
      for (const h of healthDeclarationRows) healthByNurse.set(h.nurseId, h);

      const policiesByNurse = new Map<string, typeof inductionPolicyRows>();
      for (const p of inductionPolicyRows) {
        const list = policiesByNurse.get(p.nurseId) ?? [];
        list.push(p);
        policiesByNurse.set(p.nurseId, list);
      }

      const docCategories = [
        "passport",
        "proof_of_address",
        "right_to_work",
        "nmc_register_check",
        "dbs_certificate",
        "cv",
      ];

      const rows: MatrixCandidate[] = candidates.map((c) => {
        const cells: Record<string, MatrixCell> = {};

        const nurseDocs = docsByNurse.get(c.id) ?? [];
        for (const cat of docCategories) {
          const matching = nurseDocs.filter((d) => d.category === cat);
          cells[`doc_${cat}`] = documentCell(matching);
        }

        // Professional Indemnity
        const indemnity = indemnityByNurse.get(c.id);
        if (!indemnity) {
          cells["doc_professional_indemnity"] = { status: "red", label: "Missing" };
        } else {
          const days = daysUntil(indemnity.coverEndDate);
          if (days !== null && days < 0) {
            cells["doc_professional_indemnity"] = {
              status: "red",
              label: `Expired ${formatDate(indemnity.coverEndDate)}`,
              date: indemnity.coverEndDate,
            };
          } else if (days !== null && days <= 30) {
            cells["doc_professional_indemnity"] = {
              status: "amber",
              label: `Expires ${formatDate(indemnity.coverEndDate)}`,
              date: indemnity.coverEndDate,
            };
          } else if (indemnity.verified) {
            cells["doc_professional_indemnity"] = { status: "green", label: "Verified", date: indemnity.coverEndDate };
          } else {
            cells["doc_professional_indemnity"] = { status: "amber", label: "Awaiting verification" };
          }
        }

        // Health Declaration
        const health = healthByNurse.get(c.id);
        if (!health) {
          cells["doc_health_declaration"] = { status: "red", label: "Missing" };
        } else if (health.completed) {
          if (health.aiTriageStatus === "concern") {
            cells["doc_health_declaration"] = { status: "amber", label: "OH referral needed" };
          } else {
            cells["doc_health_declaration"] = { status: "green", label: "Completed" };
          }
        } else {
          cells["doc_health_declaration"] = { status: "amber", label: "In progress" };
        }

        // Induction Policies
        const policies = policiesByNurse.get(c.id) ?? [];
        const acknowledged = policies.filter((p) => p.acknowledged).length;
        const total = Math.max(policies.length, 10);
        if (acknowledged === 0) {
          cells["doc_induction_policy_acknowledgment"] = { status: "red", label: "0 / 10 acknowledged" };
        } else if (acknowledged < total) {
          cells["doc_induction_policy_acknowledgment"] = {
            status: "amber",
            label: `${acknowledged} / ${total} acknowledged`,
          };
        } else {
          cells["doc_induction_policy_acknowledgment"] = {
            status: "green",
            label: `${acknowledged} / ${total} acknowledged`,
          };
        }

        // Personal info fields
        cells["profile_fullName"] = profileCell(c.fullName);
        cells["profile_email"] = profileCell(c.email);
        cells["profile_phone"] = profileCell(c.phone);
        cells["profile_dateOfBirth"] = profileCell(c.dateOfBirth);
        cells["profile_address"] = profileCell(c.address);
        cells["profile_nextOfKin"] = profileCell(c.nextOfKin);
        cells["profile_passportPhoto"] = profileCell(c.passportPhotoPath);
        cells["profile_nmcPin"] = profileCell(c.nmcPin);
        cells["profile_dbsNumber"] = profileCell(c.dbsNumber);
        cells["profile_band"] = profileCell(c.band);
        cells["profile_specialisms"] = profileCell(c.specialisms);

        return {
          id: c.id,
          name: c.fullName,
          email: c.email,
          band: c.band ?? null,
          onboardStatus: c.onboardStatus ?? c.status ?? null,
          cells,
        };
      });

      const response: MatrixResponse = {
        generatedAt: new Date().toISOString(),
        columns: [...ONBOARDING_DOCUMENT_COLUMNS, ...ONBOARDING_PROFILE_COLUMNS],
        candidates: rows,
      };
      res.json(response);
    } catch (err: any) {
      console.error("[admin-reports] onboarding-matrix failed:", err);
      res.status(500).json({ message: err?.message || "Failed to build onboarding matrix" });
    }
  });

  // ==================== TRAINING MATRIX ====================
  app.get("/api/admin/reports/training-matrix", requireAdmin, async (_req, res) => {
    try {
      const [candidates, training] = await Promise.all([
        storage.getCandidates(),
        storage.getAllMandatoryTraining(),
      ]);

      const trainingByNurse = new Map<string, typeof training>();
      for (const t of training) {
        const list = trainingByNurse.get(t.nurseId) ?? [];
        list.push(t);
        trainingByNurse.set(t.nurseId, list);
      }

      const columns: MatrixColumn[] = MANDATORY_TRAINING_MODULES.map((m) => ({
        key: `mt_${m.name}`,
        label: m.name,
        group: m.renewalFrequency,
      }));

      const rows: MatrixCandidate[] = candidates.map((c) => {
        const cells: Record<string, MatrixCell> = {};
        const nurseTraining = trainingByNurse.get(c.id) ?? [];

        for (const mod of MANDATORY_TRAINING_MODULES) {
          const records = nurseTraining.filter((t) => t.moduleName === mod.name);
          if (records.length === 0) {
            cells[`mt_${mod.name}`] = { status: "red", label: "Not recorded" };
            continue;
          }
          // Pick the record with the latest expiryDate (or fall back to one with completedDate)
          const sorted = [...records].sort((a, b) => {
            const ae = a.expiryDate ? new Date(a.expiryDate).getTime() : 0;
            const be = b.expiryDate ? new Date(b.expiryDate).getTime() : 0;
            return be - ae;
          });
          const rec = sorted[0];
          const days = daysUntil(rec.expiryDate);

          if (!rec.certificateUploaded && !rec.completedDate) {
            cells[`mt_${mod.name}`] = { status: "amber", label: "Started — no cert" };
          } else if (rec.expiryDate && days !== null && days < 0) {
            cells[`mt_${mod.name}`] = {
              status: "red",
              label: `Expired ${formatDate(rec.expiryDate)}`,
              date: rec.expiryDate,
            };
          } else if (rec.expiryDate && days !== null && days <= 30) {
            cells[`mt_${mod.name}`] = {
              status: "amber",
              label: `Expires ${formatDate(rec.expiryDate)}`,
              date: rec.expiryDate,
            };
          } else if (rec.certificateUploaded) {
            cells[`mt_${mod.name}`] = {
              status: "green",
              label: rec.expiryDate ? `Valid to ${formatDate(rec.expiryDate)}` : "Certificate uploaded",
              date: rec.expiryDate,
            };
          } else {
            cells[`mt_${mod.name}`] = {
              status: "amber",
              label: rec.completedDate ? `Completed ${formatDate(rec.completedDate)} — no cert` : "Pending",
              date: rec.completedDate,
            };
          }
        }

        return {
          id: c.id,
          name: c.fullName,
          email: c.email,
          band: c.band ?? null,
          onboardStatus: c.onboardStatus ?? c.status ?? null,
          cells,
        };
      });

      const response: MatrixResponse = {
        generatedAt: new Date().toISOString(),
        columns,
        candidates: rows,
      };
      res.json(response);
    } catch (err: any) {
      console.error("[admin-reports] training-matrix failed:", err);
      res.status(500).json({ message: err?.message || "Failed to build training matrix" });
    }
  });

  // ==================== COMPETENCY / SKILLS ARCADE MATRIX ====================
  app.get("/api/admin/reports/competency-matrix", requireAdmin, async (_req, res) => {
    try {
      const candidates = await storage.getCandidates();
      const declarations = await storage.getAllCompetencyDeclarations();

      // Pull arcade data: modules + per-arcade-user assignments + clearances + attempts
      const allModules = await db
        .select()
        .from(arcadeModules)
        .where(eq(arcadeModules.isActive, true));

      const allArcadeUsers = await db
        .select({ id: arcadeUsers.id, nurseId: arcadeUsers.nurseId })
        .from(arcadeUsers);

      const arcadeUserToNurse = new Map<string, string>();
      const arcadeUserIds: string[] = [];
      for (const au of allArcadeUsers) {
        if (au.nurseId) {
          arcadeUserToNurse.set(au.id, au.nurseId);
          arcadeUserIds.push(au.id);
        }
      }

      const allAssignments = arcadeUserIds.length
        ? await db.select().from(assignments).where(inArray(assignments.userId, arcadeUserIds))
        : [];
      const allClearances = arcadeUserIds.length
        ? await db.select().from(clearances).where(inArray(clearances.userId, arcadeUserIds))
        : [];
      const allAttempts = arcadeUserIds.length
        ? await db.select().from(attempts).where(inArray(attempts.userId, arcadeUserIds))
        : [];

      // Index assignments by (nurseId, moduleId)
      const assignByNurseModule = new Map<string, (typeof allAssignments)[number]>();
      for (const a of allAssignments) {
        const nurseId = arcadeUserToNurse.get(a.userId);
        if (!nurseId) continue;
        assignByNurseModule.set(`${nurseId}|${a.moduleId}`, a);
      }
      const clearByNurseModule = new Map<string, (typeof allClearances)[number]>();
      for (const c of allClearances) {
        const nurseId = arcadeUserToNurse.get(c.userId);
        if (!nurseId) continue;
        clearByNurseModule.set(`${nurseId}|${c.moduleId}`, c);
      }
      // Track if any pass attempt exists per (nurseId, moduleId) via assignment join
      const passByNurseModule = new Set<string>();
      const failByNurseModule = new Set<string>();
      // Build assignmentId -> moduleId map
      const assignmentToModule = new Map<string, string>();
      for (const a of allAssignments) {
        assignmentToModule.set(a.id, a.moduleId);
      }
      for (const at of allAttempts) {
        const nurseId = arcadeUserToNurse.get(at.userId);
        const moduleId = assignmentToModule.get(at.assignmentId);
        if (!nurseId || !moduleId) continue;
        const key = `${nurseId}|${moduleId}`;
        if (at.result === "pass") passByNurseModule.add(key);
        else if (at.result === "fail") failByNurseModule.add(key);
      }

      // Index declarations by (nurseId, domain)
      const declByNurseDomain = new Map<string, (typeof declarations)>();
      for (const d of declarations) {
        const key = `${d.nurseId}|${d.domain}`;
        const list = declByNurseDomain.get(key) ?? [];
        list.push(d);
        declByNurseDomain.set(key, list);
      }

      // Domain list (unique, in catalogue order)
      const domains: string[] = [];
      const seenDomains = new Set<string>();
      for (const c of COMPETENCY_MATRIX) {
        if (!seenDomains.has(c.domain)) {
          seenDomains.add(c.domain);
          domains.push(c.domain);
        }
      }

      const competencyColumns: MatrixColumn[] = domains.map((d) => ({
        key: `dom_${d}`,
        label: d,
        group: "Competency Domains",
      }));

      const arcadeColumns: MatrixColumn[] = allModules.map((m) => ({
        key: `mod_${m.id}`,
        label: m.name,
        group: "Skills Arcade Modules",
      }));

      const competencyByDomain = new Map<string, typeof COMPETENCY_MATRIX[number][]>();
      for (const c of COMPETENCY_MATRIX) {
        const list = competencyByDomain.get(c.domain) ?? [];
        list.push(c);
        competencyByDomain.set(c.domain, list);
      }

      const levelOrder: Record<string, number> = {
        not_declared: 0,
        level_1: 1,
        level_2: 2,
        level_3: 3,
        level_4: 4,
      };

      const rows: MatrixCandidate[] = candidates.map((c) => {
        const cells: Record<string, MatrixCell> = {};

        // Competency domains
        for (const domain of domains) {
          const required = competencyByDomain.get(domain) ?? [];
          const declList = declByNurseDomain.get(`${c.id}|${domain}`) ?? [];
          const declMap = new Map(declList.map((d) => [d.competencyName, d]));

          let mandatoryCount = 0;
          let mandatoryMet = 0;
          let anyDeclared = 0;
          let anyFlagged = 0;
          let anyUnderReview = 0;
          let anyApproved = 0;
          let anyBelowMin = 0;

          for (const comp of required) {
            const decl = declMap.get(comp.competency);
            if (comp.mandatory) {
              mandatoryCount++;
              if (
                decl &&
                decl.selfAssessedLevel !== "not_declared" &&
                decl.status !== "flagged" &&
                levelOrder[decl.selfAssessedLevel] >= levelOrder[comp.minimumLevel]
              ) {
                mandatoryMet++;
              }
            }
            if (decl && decl.selfAssessedLevel !== "not_declared") anyDeclared++;
            if (decl?.status === "flagged") anyFlagged++;
            if (decl?.status === "under_review") anyUnderReview++;
            if (decl?.status === "approved") anyApproved++;
            if (decl && levelOrder[decl.selfAssessedLevel] < levelOrder[comp.minimumLevel]) {
              anyBelowMin++;
            }
          }

          let status: CellStatus = "grey";
          let label = "Not declared";
          if (anyFlagged > 0) {
            status = "red";
            label = `${anyFlagged} flagged`;
          } else if (mandatoryCount > 0 && mandatoryMet < mandatoryCount) {
            status = "red";
            label = `${mandatoryMet} / ${mandatoryCount} mandatory met`;
          } else if (anyUnderReview > 0 || anyBelowMin > 0) {
            status = "amber";
            label = anyUnderReview > 0 ? `${anyUnderReview} under review` : `${anyBelowMin} below minimum`;
          } else if (anyApproved > 0 || (mandatoryCount > 0 && mandatoryMet === mandatoryCount)) {
            status = "green";
            label =
              mandatoryCount > 0
                ? `${mandatoryMet} / ${mandatoryCount} mandatory met`
                : `${anyApproved} approved`;
          } else if (anyDeclared > 0) {
            status = "amber";
            label = `${anyDeclared} declared`;
          }
          cells[`dom_${domain}`] = { status, label };
        }

        // Arcade modules
        for (const mod of allModules) {
          const key = `${c.id}|${mod.id}`;
          const assigned = assignByNurseModule.get(key);
          const clearance = clearByNurseModule.get(key);
          const passed = passByNurseModule.has(key);
          const failed = failByNurseModule.has(key);

          if (clearance?.status === "cleared") {
            cells[`mod_${mod.id}`] = {
              status: "green",
              label: "Cleared",
              date: clearance.clearedAt ? clearance.clearedAt.toISOString() : null,
            };
          } else if (clearance?.status === "restricted") {
            cells[`mod_${mod.id}`] = { status: "red", label: "Restricted" };
          } else if (!assigned) {
            cells[`mod_${mod.id}`] = { status: "grey", label: "Not assigned" };
          } else if (assigned.status === "locked") {
            cells[`mod_${mod.id}`] = { status: "red", label: "Locked" };
          } else if (assigned.status === "passed" || passed) {
            cells[`mod_${mod.id}`] = { status: "green", label: "Passed" };
          } else if (assigned.status === "failed" || failed) {
            cells[`mod_${mod.id}`] = { status: "red", label: "Failed" };
          } else if (assigned.status === "in_progress") {
            cells[`mod_${mod.id}`] = { status: "amber", label: "In progress" };
          } else {
            cells[`mod_${mod.id}`] = { status: "amber", label: "Not started" };
          }
        }

        return {
          id: c.id,
          name: c.fullName,
          email: c.email,
          band: c.band ?? null,
          onboardStatus: c.onboardStatus ?? c.status ?? null,
          cells,
        };
      });

      const response: MatrixResponse = {
        generatedAt: new Date().toISOString(),
        columns: [...competencyColumns, ...arcadeColumns],
        candidates: rows,
      };
      res.json(response);
    } catch (err: any) {
      console.error("[admin-reports] competency-matrix failed:", err);
      res.status(500).json({ message: err?.message || "Failed to build competency matrix" });
    }
  });
}
