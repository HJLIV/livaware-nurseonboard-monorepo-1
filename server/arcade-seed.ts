import { storage } from "./arcade-storage";
import { db } from "./db";
import { modules } from "@shared/schema";
import { count } from "drizzle-orm";
import type { ScenarioContent } from "@shared/schema";
import {
  scMedsContent, medReconciliationContent, controlledDrugsContent, syringeDriverContent,
  oxygenTherapyContent, nebuliserContent, tracheostomyContent, peakFlowContent,
  catheterisationContent, catheterMaintenanceContent, suprapubicContent, bowelManagementContent,
  pressureUlcerContent, compressionContent, skinTearContent,
  bgmContent, insulinAdminContent, diabeticFootContent, hypoManagementContent,
  syringeDriverMgmtContent, symptomAssessContent, anticipatoryContent, verificationDeathContent,
  pegFeedingContent, nutritionalScreenContent, fluidBalanceContent, dysphagiaContent,
  news2Content, fallsRiskContent, mentalCapacityContent, safeguardingContent,
  stomaAssessContent, stomaComplicationContent, stomaEducationContent,
} from "./arcade-seed-modules";

export async function seedDatabase() {
  const [{ count: moduleCount }] = await db.select({ count: count() }).from(modules);
  if (moduleCount > 0) return;

  console.log("Seeding clinical modules...");

  const mod1 = await storage.createModule({
    name: "SC Injection",
    description: "Subcutaneous injection technique including patient identification, site selection, aseptic technique, and safe sharps disposal.",
    currentVersion: "1.0.0",
    isActive: true,
    icon: "Syringe",
    color: "blue",
  });

  const mod2 = await storage.createModule({
    name: "IV Drip Rate Calculation",
    description: "Intravenous fluid administration by gravity including drip rate calculations, line priming, and infusion monitoring.",
    currentVersion: "1.0.0",
    isActive: true,
    icon: "Droplets",
    color: "teal",
  });

  const mod3 = await storage.createModule({
    name: "Wound Dressing",
    description: "Wound assessment and dressing change including aseptic technique, wound bed assessment, and appropriate dressing selection.",
    currentVersion: "1.0.0",
    isActive: true,
    icon: "Heart",
    color: "red",
  });

  const mod4 = await storage.createModule({
    name: "Venipuncture",
    description: "Venous blood sampling including patient preparation, vein selection, correct order of draw, and safe sample labelling.",
    currentVersion: "1.0.0",
    isActive: true,
    icon: "Activity",
    color: "purple",
  });

  const mod5 = await storage.createModule({
    name: "IV Troubleshooting",
    description: "Identification and management of IV infusion complications including infiltration, occlusion, and air-in-line scenarios.",
    currentVersion: "1.0.0",
    isActive: true,
    icon: "Wrench",
    color: "orange",
  });

  const mod6 = await storage.createModule({
    name: "Central Line Access & Dressing",
    description: "Central venous catheter access, hub decontamination, flush protocols, and sterile dressing change for PICC/CVC lines.",
    currentVersion: "1.0.0",
    isActive: true,
    icon: "Stethoscope",
    color: "indigo",
  });

  const mv1 = await storage.createModuleVersion({
    moduleId: mod1.id,
    version: "1.0.0",
    configJson: { minorsAllowed: 3, maxFailures: 3 },
  });

  const mv2 = await storage.createModuleVersion({
    moduleId: mod2.id,
    version: "1.0.0",
    configJson: { minorsAllowed: 3, maxFailures: 3, calculationTolerance: 1 },
  });

  const mv3 = await storage.createModuleVersion({
    moduleId: mod3.id,
    version: "1.0.0",
    configJson: { minorsAllowed: 3, maxFailures: 3 },
  });

  const mv4 = await storage.createModuleVersion({
    moduleId: mod4.id,
    version: "1.0.0",
    configJson: { minorsAllowed: 3, maxFailures: 3 },
  });

  const mv5 = await storage.createModuleVersion({
    moduleId: mod5.id,
    version: "1.0.0",
    configJson: { minorsAllowed: 3, maxFailures: 3 },
  });

  const mv6 = await storage.createModuleVersion({
    moduleId: mod6.id,
    version: "1.0.0",
    configJson: { minorsAllowed: 3, maxFailures: 3 },
  });

  const scInjectionContent: ScenarioContent = {
    tasks: [
      {
        id: "sc-ordering-1",
        type: "ordering",
        title: "SC Injection Procedure Steps",
        description: "Arrange the subcutaneous injection steps in the correct order.",
        data: {
          correctOrder: [
            { id: "sc-s1", text: "Check prescription chart: right patient, right drug, right dose, right route, right time" },
            { id: "sc-s2", text: "Confirm patient identity using two identifiers and check for allergies" },
            { id: "sc-s3", text: "Perform hand hygiene and prepare equipment using aseptic technique" },
            { id: "sc-s4", text: "Select appropriate injection site and assess skin condition" },
            { id: "sc-s5", text: "Clean site if required per local policy; allow to dry" },
            { id: "sc-s6", text: "Pinch skin fold, insert needle at 45-90° angle, and administer injection" },
            { id: "sc-s7", text: "Withdraw needle, apply gentle pressure, do not recap" },
            { id: "sc-s8", text: "Dispose of sharps immediately into sharps container at point of use" },
            { id: "sc-s9", text: "Document: drug, dose, route, site, time, batch number, and any reactions" },
          ],
          distractors: [
            { id: "sc-d1", text: "Recap the needle carefully before disposal", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Recapping needles is a sharps injury risk and violates safe sharps handling policy" },
            { id: "sc-d2", text: "Massage the injection site vigorously after injection", isDistractor: true, errorClassification: "MINOR", errorRationale: "Massaging SC injection sites can affect drug absorption and is generally not recommended" },
          ],
        },
      },
      {
        id: "sc-decision-1",
        type: "decision",
        title: "SC Injection Clinical Decisions",
        description: "You are about to administer a subcutaneous injection. Respond to the following clinical scenarios.",
        data: {
          startNodeId: "sc-d-n1",
          nodes: [
            {
              id: "sc-d-n1",
              prompt: "You notice the patient has significant bruising and a skin tear at the usual injection site on their abdomen. What do you do?",
              options: [
                { id: "sc-d-o1a", text: "Inject into the bruised area anyway — it's the prescribed site", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Injecting into compromised skin risks poor absorption and patient harm", feedback: "Never inject into bruised, broken, or compromised skin. Select an alternative site." },
                { id: "sc-d-o1b", text: "Select an alternative appropriate site (e.g., outer thigh) and document the reason", isCorrect: true, nextNodeId: "sc-d-n2", feedback: "Correct. Always assess the site and choose an alternative if the skin is compromised." },
                { id: "sc-d-o1c", text: "Ask the patient to come back tomorrow when the bruise has healed", isCorrect: false, errorClassification: "MINOR", errorRationale: "Delaying a prescribed medication without clinical justification is inappropriate", feedback: "Delaying medication is not the right approach. Choose a different injection site." },
              ],
            },
            {
              id: "sc-d-n2",
              prompt: "After injecting, the patient reports sudden dizziness and feels faint. What is your immediate action?",
              options: [
                { id: "sc-d-o2a", text: "Tell them it's normal and to wait it out", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Failure to respond to a vasovagal or adverse reaction is a safety risk", feedback: "Dizziness after injection requires immediate assessment and safe positioning." },
                { id: "sc-d-o2b", text: "Help the patient lie down safely, reassure them, monitor vital signs, and escalate if needed", isCorrect: true, nextNodeId: "sc-d-n3", feedback: "Correct. Ensure patient safety, assess for adverse reaction, and document." },
                { id: "sc-d-o2c", text: "Give the patient water and leave them to recover", isCorrect: false, errorClassification: "MINOR", errorRationale: "Leaving a symptomatic patient unmonitored is a supervision failure", feedback: "Stay with the patient and monitor until they have fully recovered." },
              ],
            },
            {
              id: "sc-d-n3",
              prompt: "The medication you drew up appears cloudy when it should be clear. What do you do?",
              options: [
                { id: "sc-d-o3a", text: "Administer it — slight cloudiness is normal for this drug", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Administering medication with abnormal appearance without verification is a drug safety risk", feedback: "Never administer medication that does not match its expected appearance." },
                { id: "sc-d-o3b", text: "Do not administer. Check expiry, storage conditions, and obtain a new supply. Report the issue.", isCorrect: true, feedback: "Correct. Any medication with unexpected appearance must not be used." },
              ],
              isTerminal: false,
            },
          ],
        },
      },
    ],
  };

  const ivDripContent: ScenarioContent = {
    tasks: [
      {
        id: "iv-ordering-1",
        type: "ordering",
        title: "IV Gravity Infusion Setup",
        description: "Arrange the steps for setting up an IV fluid infusion by gravity in the correct order.",
        data: {
          correctOrder: [
            { id: "iv-s1", text: "Check prescription: fluid type, volume, rate, and duration" },
            { id: "iv-s2", text: "Confirm patient identity and check for allergies" },
            { id: "iv-s3", text: "Check IV fluid bag: expiry date, clarity, and integrity of packaging" },
            { id: "iv-s4", text: "Perform hand hygiene and prepare giving set using aseptic technique" },
            { id: "iv-s5", text: "Spike the fluid bag and prime the line, ensuring no air bubbles" },
            { id: "iv-s6", text: "Check IV cannula site: patent, no signs of phlebitis or infiltration" },
            { id: "iv-s7", text: "Connect giving set to cannula and open the roller clamp" },
            { id: "iv-s8", text: "Set the drip rate using roller clamp, counting drops per minute" },
            { id: "iv-s9", text: "Label the giving set with date, time, and your initials" },
            { id: "iv-s10", text: "Document: fluid started, rate, site assessment, and time" },
          ],
          distractors: [
            { id: "iv-d1", text: "Connect the giving set before priming to save time", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Connecting an unprimed line introduces air into the IV system, creating an air embolism risk" },
          ],
        },
      },
      {
        id: "iv-calc-1",
        type: "calculation",
        title: "Drip Rate Calculation",
        description: "Calculate the correct drip rate for the prescribed IV infusion.",
        data: {
          question: "A patient is prescribed 1000ml of Normal Saline to run over 8 hours. The giving set delivers 20 drops per ml. Calculate the drip rate in drops per minute.",
          formula: "Drops/min = (Volume in mL × Drop factor) ÷ (Time in minutes)",
          inputs: { "Volume (mL)": 1000, "Drop factor (drops/mL)": 20, "Time (hours)": 8 },
          correctAnswer: 42,
          tolerance: 1,
          unit: "drops/min",
          errorClassification: "MAJOR",
          errorRationale: "Incorrect drip rate calculation can lead to fluid overload or under-hydration, both clinically significant errors",
        },
      },
      {
        id: "iv-decision-1",
        type: "decision",
        title: "IV Infusion Safety Checks",
        description: "You have set the drip rate. A colleague notices the rate and says it seems very fast. What do you do?",
        data: {
          startNodeId: "iv-d-n1",
          nodes: [
            {
              id: "iv-d-n1",
              prompt: "Your colleague observes the drip rate and says: 'That seems really fast — are you sure that's right?' What do you do?",
              options: [
                { id: "iv-d-o1a", text: "Ignore them — you calculated it correctly", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Dismissing a safety concern from a colleague without verification is unsafe practice", feedback: "Always verify your calculation when a concern is raised. Safety challenges should be welcomed." },
                { id: "iv-d-o1b", text: "Stop the infusion, recalculate the drip rate, verify against the prescription, and adjust if needed", isCorrect: true, nextNodeId: "iv-d-n2", feedback: "Correct. Always verify when a safety concern is raised." },
                { id: "iv-d-o1c", text: "Slow the drip down a bit without recalculating", isCorrect: false, errorClassification: "MINOR", errorRationale: "Adjusting a rate without proper recalculation may still result in an incorrect infusion rate", feedback: "Any rate adjustment must be based on the correct calculation, not guesswork." },
              ],
            },
            {
              id: "iv-d-n2",
              prompt: "During your monitoring round, you notice the cannula site is red, swollen, and the patient reports pain. The fluid is still running. What do you do?",
              options: [
                { id: "iv-d-o2a", text: "Stop the infusion immediately, assess the site, remove the cannula if infiltration confirmed, and escalate", isCorrect: true, feedback: "Correct. Signs of infiltration or phlebitis require immediate intervention." },
                { id: "iv-d-o2b", text: "Slow down the infusion and monitor", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Continuing an infusion through a compromised site risks tissue damage", feedback: "Never continue an infusion through a site showing signs of infiltration." },
                { id: "iv-d-o2c", text: "Apply a warm compress and continue the infusion", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Continuing infusion into an infiltrated site can cause tissue necrosis", feedback: "Stop the infusion first. A warm compress may help after discontinuation." },
              ],
              isTerminal: false,
            },
          ],
        },
      },
    ],
  };

  const woundDressingContent: ScenarioContent = {
    tasks: [
      {
        id: "wd-ordering-1",
        type: "ordering",
        title: "Wound Dressing Change Procedure",
        description: "Arrange the wound dressing change steps in the correct order.",
        data: {
          correctOrder: [
            { id: "wd-s1", text: "Explain procedure and obtain consent; assess and manage pain" },
            { id: "wd-s2", text: "Perform hand hygiene, gather equipment, and set up clean field" },
            { id: "wd-s3", text: "Remove old dressing carefully using clean technique" },
            { id: "wd-s4", text: "Assess the wound: size, depth, wound bed, exudate, and peri-wound skin" },
            { id: "wd-s5", text: "Cleanse wound with appropriate solution using correct technique" },
            { id: "wd-s6", text: "Apply peri-wound skin protection if indicated" },
            { id: "wd-s7", text: "Apply primary dressing appropriate to wound assessment" },
            { id: "wd-s8", text: "Apply secondary dressing and secure" },
            { id: "wd-s9", text: "Label dressing with date, time, and initials" },
            { id: "wd-s10", text: "Document: wound assessment, dressing used, and plan of care" },
          ],
          distractors: [
            { id: "wd-d1", text: "Pack the wound tightly to absorb maximum exudate", isDistractor: true, errorClassification: "MINOR", errorRationale: "Over-packing can cause pressure damage; dressings should be placed gently" },
          ],
        },
      },
      {
        id: "wd-decision-1",
        type: "decision",
        title: "Wound Assessment Decisions",
        description: "You are assessing a wound during a dressing change. Respond to the clinical scenarios.",
        data: {
          startNodeId: "wd-d-n1",
          nodes: [
            {
              id: "wd-d-n1",
              prompt: "On removing the dressing, you notice the wound bed has green, malodorous exudate, and the surrounding skin is hot and red. What do you do?",
              options: [
                { id: "wd-d-o1a", text: "Redress the wound and document findings only", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Signs of infection require escalation, not just documentation", feedback: "These are signs of wound infection. Documentation alone is not enough." },
                { id: "wd-d-o1b", text: "Clean the wound, take a wound swab if indicated, escalate to clinician for review, and document all findings", isCorrect: true, nextNodeId: "wd-d-n2", feedback: "Correct. Signs of infection require proper assessment, swab, escalation, and documentation." },
                { id: "wd-d-o1c", text: "Apply an antimicrobial dressing and review in a week", isCorrect: false, errorClassification: "MINOR", errorRationale: "Self-managing potential infection without clinical review is outside scope", feedback: "While antimicrobial dressings may be appropriate, escalation is needed first." },
              ],
            },
            {
              id: "wd-d-n2",
              prompt: "The patient tells you the pain has been getting much worse over the last 24 hours and scores it 8/10. What is your priority action?",
              options: [
                { id: "wd-d-o2a", text: "Complete the dressing change quickly to reduce discomfort", isCorrect: false, errorClassification: "MINOR", errorRationale: "Pain management should be addressed before continuing", feedback: "Address pain first before proceeding with the dressing change." },
                { id: "wd-d-o2b", text: "Stop, ensure adequate analgesia is provided, reassess pain, then continue when comfortable", isCorrect: true, feedback: "Correct. Pain should be managed before continuing any procedure." },
              ],
              isTerminal: false,
            },
          ],
        },
      },
    ],
  };

  const venipunctureContent: ScenarioContent = {
    tasks: [
      {
        id: "vp-ordering-1",
        type: "ordering",
        title: "Venipuncture Procedure",
        description: "Arrange the venipuncture steps in the correct order.",
        data: {
          correctOrder: [
            { id: "vp-s1", text: "Check request form and confirm blood tests required" },
            { id: "vp-s2", text: "Identify patient using two identifiers; check for contraindications" },
            { id: "vp-s3", text: "Explain procedure and obtain consent" },
            { id: "vp-s4", text: "Perform hand hygiene and prepare equipment" },
            { id: "vp-s5", text: "Apply tourniquet and select appropriate vein by palpation" },
            { id: "vp-s6", text: "Clean site with approved antiseptic; allow to dry completely" },
            { id: "vp-s7", text: "Perform venipuncture using correct technique" },
            { id: "vp-s8", text: "Fill tubes in correct order of draw" },
            { id: "vp-s9", text: "Release tourniquet before removing needle" },
            { id: "vp-s10", text: "Apply pressure with gauze; do not ask patient to bend arm" },
            { id: "vp-s11", text: "Label tubes at the bedside in front of the patient" },
            { id: "vp-s12", text: "Dispose of sharps safely and perform hand hygiene" },
            { id: "vp-s13", text: "Document procedure and send samples promptly" },
          ],
          distractors: [
            { id: "vp-d1", text: "Label the tubes at the nurses' station after leaving the patient", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Labelling away from the patient is a critical mislabelling risk and a never event" },
          ],
        },
      },
      {
        id: "vp-decision-1",
        type: "decision",
        title: "Venipuncture Clinical Scenarios",
        description: "Respond to scenarios that may arise during venipuncture.",
        data: {
          startNodeId: "vp-d-n1",
          nodes: [
            {
              id: "vp-d-n1",
              prompt: "During the blood draw, the patient becomes pale, sweaty, and says they feel faint. What do you do?",
              options: [
                { id: "vp-d-o1a", text: "Finish the draw quickly then attend to the patient", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Continuing a procedure on a symptomatic patient without addressing their immediate safety is harmful", feedback: "Stop the procedure immediately when a patient shows signs of syncope." },
                { id: "vp-d-o1b", text: "Stop the procedure, remove the needle safely, lie the patient down, and monitor", isCorrect: true, feedback: "Correct. Patient safety is always the priority. Remove the needle, position safely, and monitor." },
              ],
              isTerminal: false,
            },
          ],
        },
      },
    ],
  };

  const ivTroubleshootContent: ScenarioContent = {
    tasks: [
      {
        id: "ivt-decision-1",
        type: "decision",
        title: "IV Pump Alarm — Occlusion",
        description: "You are called to a patient's bedside because the IV pump is alarming. Assess the situation and respond.",
        data: {
          startNodeId: "ivt-n1",
          nodes: [
            {
              id: "ivt-n1",
              prompt: "The IV pump displays an 'Occlusion — Downstream' alarm. The infusion has stopped. What is your first action?",
              options: [
                { id: "ivt-o1a", text: "Silence the alarm and restart the infusion", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Silencing without investigating the cause is unsafe", feedback: "Never silence and restart without checking the cause of the occlusion." },
                { id: "ivt-o1b", text: "Pause the infusion, check the line from pump to patient for kinks, closed clamps, or positional issues", isCorrect: true, nextNodeId: "ivt-n2", feedback: "Correct. Systematically check the line for the cause of occlusion." },
                { id: "ivt-o1c", text: "Remove the cannula and resite immediately", isCorrect: false, errorClassification: "MINOR", errorRationale: "Resiting before troubleshooting wastes resources and causes unnecessary patient discomfort", feedback: "Troubleshoot the existing line first before considering resiting." },
              ],
            },
            {
              id: "ivt-n2",
              prompt: "You find the line is not kinked and clamps are open. The cannula site appears swollen, pale, and cool to touch. The patient says it hurts. What do you suspect and what do you do?",
              options: [
                { id: "ivt-o2a", text: "Suspect infiltration. Stop the infusion, disconnect, remove the cannula, elevate the limb, and document", isCorrect: true, nextNodeId: "ivt-n3", feedback: "Correct. These are classic signs of infiltration. Stop immediately and escalate if needed." },
                { id: "ivt-o2b", text: "Flush the cannula to see if it clears", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Flushing an infiltrated line pushes more fluid into the tissue, causing harm", feedback: "Never flush a line that shows signs of infiltration." },
                { id: "ivt-o2c", text: "Reduce the rate and continue monitoring", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Continuing infusion through an infiltrated site causes tissue damage", feedback: "Stop the infusion immediately when infiltration is suspected." },
              ],
            },
            {
              id: "ivt-n3",
              prompt: "After removing the cannula, you need to document. What should your documentation include?",
              options: [
                { id: "ivt-o3a", text: "Time of removal only", isCorrect: false, errorClassification: "MINOR", errorRationale: "Incomplete documentation fails to create a proper audit trail", feedback: "Documentation should be comprehensive." },
                { id: "ivt-o3b", text: "Time, reason for removal, site assessment, grade of infiltration, actions taken, and plan", isCorrect: true, feedback: "Correct. Thorough documentation supports patient safety and governance." },
              ],
              isTerminal: false,
            },
          ],
        },
      },
    ],
  };

  const centralLineContent: ScenarioContent = {
    tasks: [
      {
        id: "cl-ordering-1",
        type: "ordering",
        title: "Central Line Access Procedure",
        description: "Arrange the steps for accessing a central venous catheter in the correct order.",
        data: {
          correctOrder: [
            { id: "cl-s1", text: "Confirm patient ID, check prescription/indication, and review allergies" },
            { id: "cl-s2", text: "Gather equipment, check integrity and expiry, and explain procedure" },
            { id: "cl-s3", text: "Perform hand hygiene, apply PPE, and prepare sterile field" },
            { id: "cl-s4", text: "Assess line site: check for redness, exudate, pain, migration, dressing integrity" },
            { id: "cl-s5", text: "Scrub the hub for at least 15 seconds with approved antiseptic; allow to dry for 30 seconds" },
            { id: "cl-s6", text: "Access line with sterile technique using appropriate connector" },
            { id: "cl-s7", text: "Check patency: aspirate for blood return per policy" },
            { id: "cl-s8", text: "Flush with prescribed solution using pulsatile technique" },
            { id: "cl-s9", text: "Connect infusion set, start infusion, and monitor" },
            { id: "cl-s10", text: "Document: site assessment, access details, flush, and any issues or escalation" },
          ],
          distractors: [
            { id: "cl-d1", text: "Skip the hub scrub if the cap looks clean", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Omitting hub decontamination creates a central line bloodstream infection risk — a never event" },
            { id: "cl-d2", text: "Force the flush through if you feel resistance to clear the line", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Forcing a flush against resistance risks catheter rupture, embolism, or dislodging a clot" },
          ],
        },
      },
      {
        id: "cl-decision-1",
        type: "decision",
        title: "Central Line Troubleshooting",
        description: "You are accessing a central line and encounter problems. Respond to each scenario.",
        data: {
          startNodeId: "cl-d-n1",
          nodes: [
            {
              id: "cl-d-n1",
              prompt: "You attempt to aspirate blood return from the central line but get no blood back, and you feel resistance when trying to flush. What do you do?",
              options: [
                { id: "cl-d-o1a", text: "Force the flush to clear the blockage", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Forcing a flush against resistance risks catheter damage and embolism", feedback: "Never force a flush. This could rupture the catheter or dislodge a clot." },
                { id: "cl-d-o1b", text: "Stop. Do not force. Reposition the patient, try again gently. If still resistant, clamp the line and escalate to the medical team", isCorrect: true, nextNodeId: "cl-d-n2", feedback: "Correct. Reposition first, and escalate if the problem persists." },
                { id: "cl-d-o1c", text: "Remove the central line and resite", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Removing a central line without medical authorisation is outside nursing scope in most settings", feedback: "Central line removal requires a medical decision. Escalate first." },
              ],
            },
            {
              id: "cl-d-n2",
              prompt: "On your site assessment, you notice erythema, warmth, and purulent discharge at the insertion site. The patient has a temperature of 38.5°C. What do you do?",
              options: [
                { id: "cl-d-o2a", text: "Clean the site and apply a new dressing", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Signs of central line infection with systemic symptoms require immediate escalation, not just local care", feedback: "These are signs of a central line-associated bloodstream infection. Escalate immediately." },
                { id: "cl-d-o2b", text: "Do not access the line. Document findings, take blood cultures (peripheral and from line per policy), escalate urgently to medical team", isCorrect: true, feedback: "Correct. Suspected CLABSI requires urgent escalation, cultures, and potential line removal." },
              ],
              isTerminal: false,
            },
          ],
        },
      },
    ],
  };

  await storage.createScenario({ moduleVersionId: mv1.id, title: "SC Injection — Standard Scenario", contentJson: scInjectionContent, isActive: true });
  await storage.createScenario({ moduleVersionId: mv2.id, title: "IV Drip Rate — Standard Scenario", contentJson: ivDripContent, isActive: true });
  await storage.createScenario({ moduleVersionId: mv3.id, title: "Wound Dressing — Standard Scenario", contentJson: woundDressingContent, isActive: true });
  await storage.createScenario({ moduleVersionId: mv4.id, title: "Venipuncture — Standard Scenario", contentJson: venipunctureContent, isActive: true });
  await storage.createScenario({ moduleVersionId: mv5.id, title: "IV Troubleshooting — Standard Scenario", contentJson: ivTroubleshootContent, isActive: true });
  await storage.createScenario({ moduleVersionId: mv6.id, title: "Central Line — Standard Scenario", contentJson: centralLineContent, isActive: true });

  const mod7 = await storage.createModule({ name: "SC Medication Administration", description: "Subcutaneous medication administration including insulin pen devices, enoxaparin, and other SC medications with dose verification and site rotation.", currentVersion: "1.0.0", isActive: true, icon: "Pill", color: "blue" });
  const mod8 = await storage.createModule({ name: "Medication Reconciliation", description: "Home medication reconciliation visit including polypharmacy review, identifying discrepancies, and communicating with prescribers.", currentVersion: "1.0.0", isActive: true, icon: "ClipboardList", color: "teal" });
  const mod9 = await storage.createModule({ name: "Controlled Drug Administration", description: "Community controlled drug (Schedule 2) administration including legal requirements, documentation, witness procedures, and discrepancy management.", currentVersion: "1.0.0", isActive: true, icon: "Lock", color: "red" });
  const mod10 = await storage.createModule({ name: "Syringe Driver Setup", description: "McKinley T34 syringe driver setup including drug compatibility checks, rate calculation, priming, and documentation for palliative care.", currentVersion: "1.0.0", isActive: true, icon: "Timer", color: "purple" });
  const mod11 = await storage.createModule({ name: "Oxygen Therapy", description: "Home oxygen therapy management including concentrators, cylinders, flow rate calculation, and monitoring in COPD patients.", currentVersion: "1.0.0", isActive: true, icon: "Wind", color: "sky" });
  const mod12 = await storage.createModule({ name: "Nebuliser Therapy", description: "Nebulised medication administration including equipment preparation, drug delivery, patient assessment, and cleaning procedures.", currentVersion: "1.0.0", isActive: true, icon: "CloudFog", color: "cyan" });
  const mod13 = await storage.createModule({ name: "Tracheostomy Care", description: "Tracheostomy tube care and suctioning including emergency management, inner cannula changes, and stoma site care.", currentVersion: "1.0.0", isActive: true, icon: "CircleDot", color: "rose" });
  const mod14 = await storage.createModule({ name: "Peak Flow & Inhaler Technique", description: "Peak flow monitoring, inhaler technique assessment, and asthma/COPD action plan interpretation.", currentVersion: "1.0.0", isActive: true, icon: "BarChart3", color: "green" });
  const mod15 = await storage.createModule({ name: "Urinary Catheterisation", description: "Female urinary catheterisation using aseptic non-touch technique including patient preparation, insertion, and balloon inflation.", currentVersion: "1.0.0", isActive: true, icon: "Thermometer", color: "amber" });
  const mod16 = await storage.createModule({ name: "Catheter Maintenance", description: "Urinary catheter ongoing care including drainage bag changes, catheter hygiene, troubleshooting blockages, and UTI recognition.", currentVersion: "1.0.0", isActive: true, icon: "Settings", color: "orange" });
  const mod17 = await storage.createModule({ name: "Suprapubic Catheter Care", description: "Suprapubic catheter site assessment, cleaning, dressing, and complication recognition including infection and tract issues.", currentVersion: "1.0.0", isActive: true, icon: "ShieldCheck", color: "lime" });
  const mod18 = await storage.createModule({ name: "Bowel Management", description: "Bowel care assessment including digital rectal examination, constipation management, and bowel care planning.", currentVersion: "1.0.0", isActive: true, icon: "FileText", color: "stone" });
  const mod19 = await storage.createModule({ name: "Pressure Ulcer Assessment", description: "Comprehensive skin assessment using Waterlow and PURPOSE-T tools, pressure ulcer classification, and prevention planning.", currentVersion: "1.0.0", isActive: true, icon: "Scan", color: "pink" });
  const mod20 = await storage.createModule({ name: "Compression Bandaging", description: "Compression therapy for venous leg ulcers including ABPI assessment, bandage application technique, and contraindication identification.", currentVersion: "1.0.0", isActive: true, icon: "Layers", color: "violet" });
  const mod21 = await storage.createModule({ name: "Skin Tear Management", description: "Skin tear assessment using ISTAP classification, wound closure techniques, appropriate dressing selection, and prevention strategies.", currentVersion: "1.0.0", isActive: true, icon: "Scissors", color: "fuchsia" });
  const mod22 = await storage.createModule({ name: "Blood Glucose Monitoring", description: "Capillary blood glucose testing including meter operation, result interpretation, and hypo/hyperglycaemia recognition.", currentVersion: "1.0.0", isActive: true, icon: "Gauge", color: "emerald" });
  const mod23 = await storage.createModule({ name: "Insulin Administration", description: "Insulin pen administration with dose verification, site rotation, timing considerations, and insulin safety protocols.", currentVersion: "1.0.0", isActive: true, icon: "Syringe", color: "blue" });
  const mod24 = await storage.createModule({ name: "Diabetic Foot Assessment", description: "Comprehensive diabetic foot examination including neurovascular assessment, risk stratification, and appropriate referral pathways.", currentVersion: "1.0.0", isActive: true, icon: "Footprints", color: "amber" });
  const mod25 = await storage.createModule({ name: "Hypoglycaemia Management", description: "Recognition and management of hypoglycaemia in conscious and unconscious patients including glucose administration and escalation.", currentVersion: "1.0.0", isActive: true, icon: "AlertTriangle", color: "red" });
  const mod26 = await storage.createModule({ name: "Syringe Driver Monitoring", description: "Ongoing monitoring of McKinley T34 syringe driver including site assessment, rate verification, breakthrough medication, and troubleshooting.", currentVersion: "1.0.0", isActive: true, icon: "MonitorCheck", color: "indigo" });
  const mod27 = await storage.createModule({ name: "Palliative Symptom Assessment", description: "Symptom assessment using validated tools (IPOS, Abbey Pain Scale) for palliative patients including non-verbal pain assessment.", currentVersion: "1.0.0", isActive: true, icon: "HeartHandshake", color: "rose" });
  const mod28 = await storage.createModule({ name: "Anticipatory Prescribing", description: "Administration of anticipatory (just-in-case) medications for palliative patients including symptom-specific drug selection and documentation.", currentVersion: "1.0.0", isActive: true, icon: "Pill", color: "purple" });
  const mod29 = await storage.createModule({ name: "Verification of Expected Death", description: "Procedure for verification of expected death in the community including physical assessment, documentation, and family support.", currentVersion: "1.0.0", isActive: true, icon: "FileCheck", color: "slate" });
  const mod30 = await storage.createModule({ name: "PEG/NG Tube Feeding", description: "Enteral feeding via PEG or nasogastric tube including feed preparation, administration, flushing, and complication management.", currentVersion: "1.0.0", isActive: true, icon: "Utensils", color: "orange" });
  const mod31 = await storage.createModule({ name: "Nutritional Screening (MUST)", description: "Malnutrition Universal Screening Tool completion including BMI calculation, weight loss assessment, and care plan development.", currentVersion: "1.0.0", isActive: true, icon: "Scale", color: "green" });
  const mod32 = await storage.createModule({ name: "Fluid Balance Monitoring", description: "Accurate fluid intake and output recording, fluid balance calculation, and recognition of dehydration and fluid overload.", currentVersion: "1.0.0", isActive: true, icon: "Droplets", color: "cyan" });
  const mod33 = await storage.createModule({ name: "Dysphagia & Thickened Fluids", description: "Safe feeding for patients with dysphagia including IDDSI framework, aspiration risk recognition, and appropriate food/fluid modification.", currentVersion: "1.0.0", isActive: true, icon: "GlassWater", color: "teal" });
  const mod34 = await storage.createModule({ name: "NEWS2 Assessment", description: "National Early Warning Score 2 calculation including physiological observations, aggregate scoring, and clinical escalation protocols.", currentVersion: "1.0.0", isActive: true, icon: "Activity", color: "red" });
  const mod35 = await storage.createModule({ name: "Falls Risk Assessment", description: "Falls risk assessment in home setting including environmental review, mobility assessment, post-fall protocol, and prevention planning.", currentVersion: "1.0.0", isActive: true, icon: "PersonStanding", color: "amber" });
  const mod36 = await storage.createModule({ name: "Mental Capacity Assessment", description: "Mental Capacity Act 2005 assessment including the two-stage test, best interests decision-making, and documentation requirements.", currentVersion: "1.0.0", isActive: true, icon: "Brain", color: "violet" });
  const mod37 = await storage.createModule({ name: "Safeguarding Referral", description: "Safeguarding assessment and referral process including recognition of abuse types, duty to report, and multi-agency working.", currentVersion: "1.0.0", isActive: true, icon: "Shield", color: "rose" });
  const mod38 = await storage.createModule({ name: "Stoma Assessment & Appliance", description: "Stoma assessment, appliance selection and change procedure including peristomal skin care and output monitoring.", currentVersion: "1.0.0", isActive: true, icon: "Circle", color: "pink" });
  const mod39 = await storage.createModule({ name: "Stoma Complications", description: "Recognition and management of stoma complications including prolapse, retraction, parastomal hernia, and mucocutaneous separation.", currentVersion: "1.0.0", isActive: true, icon: "AlertCircle", color: "red" });
  const mod40 = await storage.createModule({ name: "Stoma Patient Education", description: "Patient education for stoma self-care including appliance management, diet guidance, lifestyle adaptation, and psychological support.", currentVersion: "1.0.0", isActive: true, icon: "GraduationCap", color: "blue" });

  const newMods = [mod7, mod8, mod9, mod10, mod11, mod12, mod13, mod14, mod15, mod16, mod17, mod18, mod19, mod20, mod21, mod22, mod23, mod24, mod25, mod26, mod27, mod28, mod29, mod30, mod31, mod32, mod33, mod34, mod35, mod36, mod37, mod38, mod39, mod40];
  const newMvs: Awaited<ReturnType<typeof storage.createModuleVersion>>[] = [];
  for (const mod of newMods) {
    const mv = await storage.createModuleVersion({ moduleId: mod.id, version: "1.0.0", configJson: { minorsAllowed: 3, maxFailures: 3 } });
    newMvs.push(mv);
  }

  const newScenarioData: { mv: typeof newMvs[0]; title: string; content: ScenarioContent }[] = [
    { mv: newMvs[0], title: "SC Medication — Standard Scenario", content: scMedsContent },
    { mv: newMvs[1], title: "Medication Reconciliation — Standard Scenario", content: medReconciliationContent },
    { mv: newMvs[2], title: "Controlled Drugs — Standard Scenario", content: controlledDrugsContent },
    { mv: newMvs[3], title: "Syringe Driver Setup — Standard Scenario", content: syringeDriverContent },
    { mv: newMvs[4], title: "Oxygen Therapy — Standard Scenario", content: oxygenTherapyContent },
    { mv: newMvs[5], title: "Nebuliser Therapy — Standard Scenario", content: nebuliserContent },
    { mv: newMvs[6], title: "Tracheostomy Care — Standard Scenario", content: tracheostomyContent },
    { mv: newMvs[7], title: "Peak Flow & Inhaler — Standard Scenario", content: peakFlowContent },
    { mv: newMvs[8], title: "Urinary Catheterisation — Standard Scenario", content: catheterisationContent },
    { mv: newMvs[9], title: "Catheter Maintenance — Standard Scenario", content: catheterMaintenanceContent },
    { mv: newMvs[10], title: "Suprapubic Catheter — Standard Scenario", content: suprapubicContent },
    { mv: newMvs[11], title: "Bowel Management — Standard Scenario", content: bowelManagementContent },
    { mv: newMvs[12], title: "Pressure Ulcer Assessment — Standard Scenario", content: pressureUlcerContent },
    { mv: newMvs[13], title: "Compression Bandaging — Standard Scenario", content: compressionContent },
    { mv: newMvs[14], title: "Skin Tear Management — Standard Scenario", content: skinTearContent },
    { mv: newMvs[15], title: "Blood Glucose Monitoring — Standard Scenario", content: bgmContent },
    { mv: newMvs[16], title: "Insulin Administration — Standard Scenario", content: insulinAdminContent },
    { mv: newMvs[17], title: "Diabetic Foot Assessment — Standard Scenario", content: diabeticFootContent },
    { mv: newMvs[18], title: "Hypoglycaemia Management — Standard Scenario", content: hypoManagementContent },
    { mv: newMvs[19], title: "Syringe Driver Monitoring — Standard Scenario", content: syringeDriverMgmtContent },
    { mv: newMvs[20], title: "Palliative Symptom Assessment — Standard Scenario", content: symptomAssessContent },
    { mv: newMvs[21], title: "Anticipatory Prescribing — Standard Scenario", content: anticipatoryContent },
    { mv: newMvs[22], title: "Verification of Death — Standard Scenario", content: verificationDeathContent },
    { mv: newMvs[23], title: "PEG/NG Tube Feeding — Standard Scenario", content: pegFeedingContent },
    { mv: newMvs[24], title: "Nutritional Screening — Standard Scenario", content: nutritionalScreenContent },
    { mv: newMvs[25], title: "Fluid Balance — Standard Scenario", content: fluidBalanceContent },
    { mv: newMvs[26], title: "Dysphagia & Thickened Fluids — Standard Scenario", content: dysphagiaContent },
    { mv: newMvs[27], title: "NEWS2 Assessment — Standard Scenario", content: news2Content },
    { mv: newMvs[28], title: "Falls Risk Assessment — Standard Scenario", content: fallsRiskContent },
    { mv: newMvs[29], title: "Mental Capacity Assessment — Standard Scenario", content: mentalCapacityContent },
    { mv: newMvs[30], title: "Safeguarding Referral — Standard Scenario", content: safeguardingContent },
    { mv: newMvs[31], title: "Stoma Assessment — Standard Scenario", content: stomaAssessContent },
    { mv: newMvs[32], title: "Stoma Complications — Standard Scenario", content: stomaComplicationContent },
    { mv: newMvs[33], title: "Stoma Patient Education — Standard Scenario", content: stomaEducationContent },
  ];

  for (const s of newScenarioData) {
    await storage.createScenario({ moduleVersionId: s.mv.id, title: s.title, contentJson: s.content, isActive: true });
  }

  console.log("Database seeded successfully with 40 clinical modules.");
}
