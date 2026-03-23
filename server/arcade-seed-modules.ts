import type { ScenarioContent } from "@shared/schema";

export const scMedsContent: ScenarioContent = {
  tasks: [
    {
      id: "scm-ordering-1",
      type: "ordering",
      title: "Insulin Pen Administration",
      description: "Arrange the steps for administering insulin via a pen device in the correct order.",
      data: {
        correctOrder: [
          { id: "scm-s1", text: "Check prescription: right patient, right insulin type, right dose, right time" },
          { id: "scm-s2", text: "Confirm patient identity using two identifiers and check for allergies" },
          { id: "scm-s3", text: "Check insulin pen: correct type (rapid/long-acting), expiry date, appearance, and storage" },
          { id: "scm-s4", text: "Perform hand hygiene and put on gloves" },
          { id: "scm-s5", text: "If cloudy insulin (e.g. isophane), gently roll pen 10 times and invert 10 times to resuspend" },
          { id: "scm-s6", text: "Attach a new pen needle and perform a safety air shot (2 units) to prime" },
          { id: "scm-s7", text: "Dial the prescribed dose on the pen" },
          { id: "scm-s8", text: "Select and assess injection site; rotate from previous site" },
          { id: "scm-s9", text: "Pinch skin fold, insert needle at 90° angle, press plunger fully, and hold for 10 seconds" },
          { id: "scm-s10", text: "Withdraw needle, apply gentle pressure; do not rub site" },
          { id: "scm-s11", text: "Remove and dispose of pen needle into sharps container" },
          { id: "scm-s12", text: "Document: insulin type, dose, site, time, and batch number" },
        ],
        distractors: [
          { id: "scm-d1", text: "Shake the insulin pen vigorously to mix", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Shaking insulin causes frothing and denaturation of the protein, affecting dose accuracy" },
          { id: "scm-d2", text: "Leave the pen needle attached for the next dose", isDistractor: true, errorClassification: "MINOR", errorRationale: "Leaving the needle attached allows air ingress and insulin leakage, affecting dose accuracy" },
        ],
      },
    },
    {
      id: "scm-decision-1",
      type: "decision",
      title: "Insulin Dose Adjustment & Hypoglycaemia Recognition",
      description: "Manage clinical scenarios relating to insulin administration and hypoglycaemia in the community.",
      data: {
        startNodeId: "scm-d-n1",
        nodes: [
          {
            id: "scm-d-n1",
            prompt: "You arrive to administer a patient's morning insulin. Their pre-meal blood glucose is 3.2 mmol/L. They are alert but feel shaky and sweaty. What do you do?",
            options: [
              { id: "scm-d-o1a", text: "Administer the insulin as prescribed — the dose has been ordered by the GP", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Administering insulin during hypoglycaemia will further lower blood glucose, risking loss of consciousness or seizure", feedback: "Never administer insulin when blood glucose is below 4 mmol/L." },
              { id: "scm-d-o1b", text: "Withhold insulin, treat hypoglycaemia with fast-acting glucose (e.g. 150–200ml fruit juice), recheck BG in 15 minutes, and contact prescriber", isCorrect: true, nextNodeId: "scm-d-n2", feedback: "Correct. Treat hypo first following the hypo protocol, then contact prescriber about dose adjustment." },
              { id: "scm-d-o1c", text: "Give half the prescribed dose and ask the patient to eat breakfast immediately", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Administering any insulin during active hypoglycaemia worsens the situation; dose adjustment is not a nursing decision without prescriber input", feedback: "Do not alter the insulin dose independently. Treat the hypo first and contact prescriber." },
            ],
          },
          {
            id: "scm-d-n2",
            prompt: "After treating the hypoglycaemia, the patient's BG is now 5.8 mmol/L. They ask whether they should still have their insulin. What do you do?",
            options: [
              { id: "scm-d-o2a", text: "Administer the full prescribed dose now that BG has recovered", isCorrect: false, errorClassification: "MINOR", errorRationale: "The timing and appropriateness of the dose after a hypo episode should be discussed with the prescriber", feedback: "Contact prescriber to confirm whether the dose should still be given after a hypo event." },
              { id: "scm-d-o2b", text: "Contact the prescriber to discuss whether to administer the dose, document the hypo event, BG readings, treatment given, and outcome", isCorrect: true, feedback: "Correct. Always seek prescriber guidance after a hypo event before administering insulin." },
            ],
          },
        ],
      },
    },
  ],
};

export const medReconciliationContent: ScenarioContent = {
  tasks: [
    {
      id: "mr-ordering-1",
      type: "ordering",
      title: "Home Medication Reconciliation Visit",
      description: "Arrange the steps for conducting a medication reconciliation visit in a patient's home.",
      data: {
        correctOrder: [
          { id: "mr-s1", text: "Review the patient's current medication list from GP records and discharge summary" },
          { id: "mr-s2", text: "Confirm patient identity and explain the purpose of the visit" },
          { id: "mr-s3", text: "Ask the patient to gather all medications including OTC, herbal, and supplements" },
          { id: "mr-s4", text: "Compare each medication against the prescribed list, checking name, dose, frequency, and form" },
          { id: "mr-s5", text: "Identify any discrepancies: omissions, additions, duplications, or dose changes" },
          { id: "mr-s6", text: "Check expiry dates and storage conditions of all medications" },
          { id: "mr-s7", text: "Assess patient's understanding of each medication and adherence" },
          { id: "mr-s8", text: "Document findings and discrepancies; communicate urgent issues to GP/pharmacist" },
          { id: "mr-s9", text: "Arrange safe disposal of discontinued or expired medications" },
        ],
        distractors: [
          { id: "mr-d1", text: "Dispose of discontinued medications by flushing them down the toilet", isDistractor: true, errorClassification: "MINOR", errorRationale: "Medications should be returned to pharmacy for safe disposal, not flushed, due to environmental contamination risk" },
        ],
      },
    },
    {
      id: "mr-decision-1",
      type: "decision",
      title: "Drug Interactions & Discrepancies",
      description: "Identify and manage medication discrepancies during a reconciliation visit.",
      data: {
        startNodeId: "mr-d-n1",
        nodes: [
          {
            id: "mr-d-n1",
            prompt: "During reconciliation, you discover the patient is taking both warfarin and a new over-the-counter ibuprofen they bought from the pharmacy. What do you do?",
            options: [
              { id: "mr-d-o1a", text: "Note it in the records and mention it at the next GP appointment", isCorrect: false, errorClassification: "MAJOR", errorRationale: "NSAIDs with warfarin significantly increase bleeding risk; this requires urgent action, not delayed reporting", feedback: "This is an urgent drug interaction. Contact the GP or pharmacist immediately." },
              { id: "mr-d-o1b", text: "Advise the patient to stop taking ibuprofen immediately, explain the bleeding risk, and contact the GP or pharmacist urgently", isCorrect: true, nextNodeId: "mr-d-n2", feedback: "Correct. NSAIDs and warfarin together significantly increase bleeding risk. This needs urgent communication." },
              { id: "mr-d-o1c", text: "Tell the patient to reduce the ibuprofen dose to once daily", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Even low-dose NSAIDs with warfarin increase bleeding risk; dose reduction does not resolve the interaction", feedback: "The combination should be avoided entirely. Contact prescriber urgently." },
            ],
          },
          {
            id: "mr-d-n2",
            prompt: "You also notice the patient has two different strengths of amlodipine at home: 5mg and 10mg. The GP list shows 10mg daily. The patient says they have been taking one of each. What do you do?",
            options: [
              { id: "mr-d-o2a", text: "Tell the patient to take only the 10mg and dispose of the 5mg tablets", isCorrect: false, errorClassification: "MINOR", errorRationale: "Instructing medication changes without prescriber confirmation is outside scope; the 5mg may be from a previous prescription", feedback: "Document the discrepancy and contact the GP to clarify before advising the patient." },
              { id: "mr-d-o2b", text: "Document the discrepancy, advise the patient to take only the prescribed 10mg for now, and contact the GP urgently to clarify", isCorrect: true, feedback: "Correct. Clarify the correct dose with the GP and ensure the patient understands what to take." },
            ],
          },
        ],
      },
    },
  ],
};

export const controlledDrugsContent: ScenarioContent = {
  tasks: [
    {
      id: "cd-ordering-1",
      type: "ordering",
      title: "Community CD Administration (Schedule 2)",
      description: "Arrange the steps for administering a Schedule 2 controlled drug in the community.",
      data: {
        correctOrder: [
          { id: "cd-s1", text: "Check the prescription meets legal requirements: patient name, drug, dose, form, strength, total quantity in words and figures, prescriber signature and date" },
          { id: "cd-s2", text: "Confirm patient identity using two identifiers" },
          { id: "cd-s3", text: "Check CD stock against the CD register entry; verify amount tallies with running balance" },
          { id: "cd-s4", text: "Have a second registered professional witness the stock check and dose preparation" },
          { id: "cd-s5", text: "Prepare the prescribed dose, witnessed by the second checker" },
          { id: "cd-s6", text: "Both professionals independently verify: right drug, right dose, right route, right patient, right time" },
          { id: "cd-s7", text: "Administer the CD to the patient" },
          { id: "cd-s8", text: "Both witnesses sign the CD register: date, time, patient name, dose given, running balance, and signatures of both professionals" },
          { id: "cd-s9", text: "Store remaining stock securely in the locked CD cupboard" },
          { id: "cd-s10", text: "Document administration in the patient's medication record" },
        ],
        distractors: [
          { id: "cd-d1", text: "Prepare the dose in advance and leave it on the side for the witness to check later", isDistractor: true, errorClassification: "MAJOR", errorRationale: "CD preparation must be witnessed in real-time; pre-preparation without witnessing violates CD regulations" },
        ],
      },
    },
    {
      id: "cd-decision-1",
      type: "decision",
      title: "CD Documentation & Discrepancy Scenarios",
      description: "Manage controlled drug documentation and discrepancy situations in community nursing.",
      data: {
        startNodeId: "cd-d-n1",
        nodes: [
          {
            id: "cd-d-n1",
            prompt: "During a CD stock check, you count 8 morphine sulphate 10mg tablets, but the CD register shows a running balance of 10. What do you do?",
            options: [
              { id: "cd-d-o1a", text: "Recount and if still discrepant, amend the register to show 8 and continue", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Amending the register without investigation conceals a potential diversion or error; this is a legal requirement to report", feedback: "Never amend the register to cover a discrepancy. This must be reported and investigated." },
              { id: "cd-d-o1b", text: "Recount with the witness. If confirmed discrepant, do not administer, secure the stock, report immediately to line manager and pharmacist, and complete an incident report", isCorrect: true, nextNodeId: "cd-d-n2", feedback: "Correct. CD discrepancies must be reported immediately and investigated. Never amend the register." },
              { id: "cd-d-o1c", text: "Assume a previous dose was not recorded and add a retrospective entry", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Making retrospective entries to the CD register without evidence is falsification and a legal offence", feedback: "Retrospective entries must only be made with appropriate authorisation and investigation." },
            ],
          },
          {
            id: "cd-d-n2",
            prompt: "A patient's family member asks you to leave an extra dose of morphine 'just in case' the patient needs it overnight. What do you do?",
            options: [
              { id: "cd-d-o2a", text: "Leave an extra dose labelled with instructions for the family", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Leaving unattended CDs with unlicensed individuals is a breach of CD legislation and creates safeguarding risks", feedback: "CDs must only be administered by authorised professionals and stored securely." },
              { id: "cd-d-o2b", text: "Explain that CDs cannot be left unattended, ensure anticipatory prescriptions are in place for out-of-hours use, and document the conversation", isCorrect: true, feedback: "Correct. Ensure appropriate anticipatory prescribing is in place through the GP or palliative care team." },
            ],
          },
        ],
      },
    },
  ],
};

export const syringeDriverContent: ScenarioContent = {
  tasks: [
    {
      id: "sd-ordering-1",
      type: "ordering",
      title: "McKinley T34 Syringe Driver Setup",
      description: "Arrange the steps for setting up a T34 syringe driver for continuous subcutaneous infusion.",
      data: {
        correctOrder: [
          { id: "sd-s1", text: "Check prescription: drug(s), dose(s), diluent, route (CSCI), and rate (over 24 hours)" },
          { id: "sd-s2", text: "Confirm patient identity and obtain/confirm consent" },
          { id: "sd-s3", text: "Gather equipment: T34 pump, Luer-lock syringe, giving set with anti-syphon valve, battery" },
          { id: "sd-s4", text: "Check drug compatibility if multiple drugs prescribed in same syringe" },
          { id: "sd-s5", text: "Draw up prescribed medication(s) and dilute with water for injection to appropriate volume; second checker verifies" },
          { id: "sd-s6", text: "Label syringe with patient name, drug(s), dose(s), diluent, date, time, and both checkers' signatures" },
          { id: "sd-s7", text: "Prime the giving set line, ensuring no air bubbles" },
          { id: "sd-s8", text: "Load syringe into the T34 pump, connect giving set" },
          { id: "sd-s9", text: "Insert subcutaneous cannula at chosen site (upper arm, chest wall, abdomen, or thigh)" },
          { id: "sd-s10", text: "Set rate in mm per 24 hours on the T34; verify with second checker" },
          { id: "sd-s11", text: "Press start, confirm infusion is running, and secure the pump in a lockbox" },
          { id: "sd-s12", text: "Document: drugs, doses, site, start time, rate, and batch numbers" },
        ],
        distractors: [
          { id: "sd-d1", text: "Use normal saline as diluent for all drugs in the syringe driver", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Normal saline can cause precipitation with some palliative drugs (e.g. cyclizine); water for injection is the standard diluent for T34 CSCI" },
        ],
      },
    },
    {
      id: "sd-calc-1",
      type: "calculation",
      title: "Syringe Driver Rate Calculation",
      description: "Calculate the rate in mm/hr for a 24-hour syringe driver infusion.",
      data: {
        question: "A McKinley T34 syringe driver is set up with a total volume of 17ml in a Luer-lock syringe. The syringe length from zero to 17ml measures 48mm. The infusion is to run over 24 hours. Calculate the rate in mm per hour.",
        formula: "Rate (mm/hr) = Syringe length (mm) ÷ Time (hours)",
        inputs: { "Syringe length (mm)": 48, "Time (hours)": 24 },
        correctAnswer: 2,
        tolerance: 0.1,
        unit: "mm/hr",
        errorClassification: "MAJOR",
        errorRationale: "Incorrect syringe driver rate calculation could result in under- or over-dosing of palliative medications, causing symptom breakthrough or toxicity",
      },
    },
    {
      id: "sd-decision-1",
      type: "decision",
      title: "Syringe Driver Alarm Troubleshooting",
      description: "Troubleshoot syringe driver alarms and complications during a home visit.",
      data: {
        startNodeId: "sd-d-n1",
        nodes: [
          {
            id: "sd-d-n1",
            prompt: "You visit a palliative patient and the T34 syringe driver is alarming with an occlusion alarm. What is your first action?",
            options: [
              { id: "sd-d-o1a", text: "Silence the alarm and restart the pump", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Restarting without investigating the occlusion could mask a line disconnection or site issue", feedback: "Always investigate the cause of the alarm before restarting." },
              { id: "sd-d-o1b", text: "Check the line from syringe to cannula site for kinks, check the cannula site for swelling or displacement, and assess the syringe is loaded correctly", isCorrect: true, nextNodeId: "sd-d-n2", feedback: "Correct. Systematically check the entire system from syringe to site." },
              { id: "sd-d-o1c", text: "Remove the syringe and set up a completely new infusion", isCorrect: false, errorClassification: "MINOR", errorRationale: "This wastes medication and delays symptom control; troubleshoot the current setup first", feedback: "Troubleshoot the current infusion before replacing it." },
            ],
          },
          {
            id: "sd-d-n2",
            prompt: "The cannula site is red, hard, and swollen. What do you do?",
            options: [
              { id: "sd-d-o2a", text: "Continue the infusion at the same site as the drugs are still being absorbed", isCorrect: false, errorClassification: "MAJOR", errorRationale: "An inflamed site indicates poor absorption and potential tissue damage; the site must be changed", feedback: "Never continue infusing into an inflamed or swollen site." },
              { id: "sd-d-o2b", text: "Stop the infusion, remove the cannula, resite at a new location, restart the infusion, and document", isCorrect: true, feedback: "Correct. The site must be changed. Document the site reaction and new site location." },
            ],
          },
        ],
      },
    },
  ],
};

export const oxygenTherapyContent: ScenarioContent = {
  tasks: [
    {
      id: "ot-ordering-1",
      type: "ordering",
      title: "Setting Up Home Oxygen Therapy",
      description: "Arrange the steps for setting up and commencing home oxygen therapy.",
      data: {
        correctOrder: [
          { id: "ot-s1", text: "Check the home oxygen prescription (HOOF): flow rate, hours per day, delivery device, and target SpO2" },
          { id: "ot-s2", text: "Confirm patient identity and assess current respiratory status" },
          { id: "ot-s3", text: "Ensure the environment is safe: no smoking, no naked flames, adequate ventilation" },
          { id: "ot-s4", text: "Check oxygen equipment: cylinder gauge/concentrator function, tubing connections, and delivery device" },
          { id: "ot-s5", text: "Set the prescribed flow rate on the flowmeter" },
          { id: "ot-s6", text: "Apply the delivery device (nasal cannulae or mask) and ensure patient comfort" },
          { id: "ot-s7", text: "Monitor SpO2 and respiratory rate; titrate to prescribed target range" },
          { id: "ot-s8", text: "Educate patient and carers on safe use, signs of deterioration, and when to call for help" },
          { id: "ot-s9", text: "Document: flow rate, delivery device, SpO2, respiratory rate, and patient response" },
        ],
        distractors: [
          { id: "ot-d1", text: "Apply petroleum-based moisturiser around the nostrils to prevent dryness", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Petroleum-based products are flammable and must not be used near oxygen delivery equipment" },
        ],
      },
    },
    {
      id: "ot-decision-1",
      type: "decision",
      title: "Oxygen Management in COPD Patients",
      description: "Manage oxygen therapy in a patient with COPD and risk of CO2 retention.",
      data: {
        startNodeId: "ot-d-n1",
        nodes: [
          {
            id: "ot-d-n1",
            prompt: "You visit a COPD patient on home oxygen at 2L/min via nasal cannulae. Their SpO2 is 85% and they are more breathless than usual. Their target range is 88–92%. What do you do?",
            options: [
              { id: "ot-d-o1a", text: "Increase oxygen to 10L/min via non-rebreathe mask to get SpO2 above 94%", isCorrect: false, errorClassification: "MAJOR", errorRationale: "High-flow oxygen in CO2-retaining COPD patients can suppress respiratory drive, causing type 2 respiratory failure", feedback: "COPD patients with CO2 retention risk must have controlled oxygen therapy with a target of 88–92%." },
              { id: "ot-d-o1b", text: "Titrate oxygen up gradually (e.g. to 3–4L/min), aim for target SpO2 88–92%, monitor closely, and call GP or 999 if not improving", isCorrect: true, nextNodeId: "ot-d-n2", feedback: "Correct. Titrate carefully to target range. Monitor for signs of CO2 retention (drowsiness, confusion, headache)." },
              { id: "ot-d-o1c", text: "Remove the oxygen as it might be making things worse", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Removing oxygen from a hypoxic patient is dangerous and could worsen respiratory failure", feedback: "Do not remove oxygen. Titrate to target and escalate appropriately." },
            ],
          },
          {
            id: "ot-d-n2",
            prompt: "After increasing to 3L/min, the patient's SpO2 is 90% but they are becoming drowsy and confused. What does this suggest and what do you do?",
            options: [
              { id: "ot-d-o2a", text: "They are probably tired; let them rest and recheck later", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Drowsiness and confusion in a COPD patient on oxygen is a sign of CO2 retention, a medical emergency", feedback: "These are signs of CO2 retention. Call 999 immediately." },
              { id: "ot-d-o2b", text: "Suspect CO2 retention. Maintain current oxygen to target 88–92%, call 999, stay with patient, and monitor until help arrives", isCorrect: true, feedback: "Correct. Drowsiness and confusion on oxygen suggests hypercapnia. This is a medical emergency requiring urgent assessment." },
            ],
          },
        ],
      },
    },
    {
      id: "ot-calc-1",
      type: "calculation",
      title: "Oxygen Cylinder Duration Calculation",
      description: "Calculate how long an oxygen cylinder will last at a given flow rate.",
      data: {
        question: "A portable oxygen cylinder contains 340 litres of oxygen. The patient is prescribed 2 litres per minute. Calculate how long the cylinder will last in minutes.",
        formula: "Duration (minutes) = Cylinder volume (litres) ÷ Flow rate (litres/minute)",
        inputs: { "Cylinder volume (litres)": 340, "Flow rate (L/min)": 2 },
        correctAnswer: 170,
        tolerance: 1,
        unit: "minutes",
        errorClassification: "MAJOR",
        errorRationale: "Incorrect calculation of cylinder duration could leave a patient without oxygen during transport or home use",
      },
    },
  ],
};

export const nebuliserContent: ScenarioContent = {
  tasks: [
    {
      id: "neb-ordering-1",
      type: "ordering",
      title: "Administering Nebulised Medication",
      description: "Arrange the steps for administering medication via a nebuliser in the community.",
      data: {
        correctOrder: [
          { id: "neb-s1", text: "Check prescription: drug, dose, diluent (if required), frequency, and driving gas (air or oxygen)" },
          { id: "neb-s2", text: "Confirm patient identity and assess current respiratory status (SpO2, RR, work of breathing)" },
          { id: "neb-s3", text: "Position patient upright or semi-upright" },
          { id: "neb-s4", text: "Open nebule(s) and add medication to the nebuliser chamber; add diluent if prescribed" },
          { id: "neb-s5", text: "Assemble nebuliser chamber, mask or mouthpiece, and connect to driving gas source" },
          { id: "neb-s6", text: "Set flow rate to 6–8 L/min (or as prescribed); use air for COPD patients at risk of CO2 retention" },
          { id: "neb-s7", text: "Apply mask or mouthpiece and instruct patient to breathe normally through the mouth" },
          { id: "neb-s8", text: "Continue until sputtering stops (approximately 5–10 minutes)" },
          { id: "neb-s9", text: "Reassess respiratory status: SpO2, RR, work of breathing, and symptom relief" },
          { id: "neb-s10", text: "Clean nebuliser equipment; document treatment and patient response" },
        ],
        distractors: [
          { id: "neb-d1", text: "Drive the nebuliser with high-flow oxygen at 15L/min for all patients", isDistractor: true, errorClassification: "MAJOR", errorRationale: "High-flow oxygen-driven nebulisers in COPD patients risk CO2 retention; air-driven nebulisers should be used" },
        ],
      },
    },
    {
      id: "neb-decision-1",
      type: "decision",
      title: "Assessing Patient Response & Escalation",
      description: "Assess patient response to nebulised therapy and determine when to escalate.",
      data: {
        startNodeId: "neb-d-n1",
        nodes: [
          {
            id: "neb-d-n1",
            prompt: "After a salbutamol nebuliser, the patient's wheeze has not improved and their SpO2 has dropped from 93% to 89%. They are using accessory muscles. What do you do?",
            options: [
              { id: "neb-d-o1a", text: "Give a second nebuliser and wait another 20 minutes", isCorrect: false, errorClassification: "MINOR", errorRationale: "Deterioration after initial nebuliser requires urgent escalation, not repeated treatment alone", feedback: "While a repeat nebuliser may be appropriate, the deterioration requires urgent medical review." },
              { id: "neb-d-o1b", text: "Call 999 immediately, keep patient upright, commence oxygen if prescribed, administer repeat nebuliser if available and prescribed, and stay with patient", isCorrect: true, nextNodeId: "neb-d-n2", feedback: "Correct. Worsening respiratory distress after nebuliser therapy requires emergency escalation." },
              { id: "neb-d-o1c", text: "Document the findings and arrange a GP visit for later today", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Acute respiratory deterioration with accessory muscle use is a medical emergency requiring immediate intervention", feedback: "This is a respiratory emergency. Call 999 immediately." },
            ],
          },
          {
            id: "neb-d-n2",
            prompt: "While waiting for the ambulance, the patient becomes increasingly agitated and says they can't breathe. What is your priority?",
            options: [
              { id: "neb-d-o2a", text: "Lay the patient flat to help them rest", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Lying a breathless patient flat worsens respiratory distress by increasing the work of breathing", feedback: "Keep the patient upright. Lying flat worsens breathlessness." },
              { id: "neb-d-o2b", text: "Keep patient upright, provide calm reassurance, monitor SpO2 and breathing pattern continuously, and prepare a handover for the ambulance crew", isCorrect: true, feedback: "Correct. Maintain position, reassure, monitor, and prepare for handover to paramedics." },
            ],
          },
        ],
      },
    },
  ],
};

export const tracheostomyContent: ScenarioContent = {
  tasks: [
    {
      id: "trach-ordering-1",
      type: "ordering",
      title: "Tracheostomy Suctioning",
      description: "Arrange the steps for performing tracheostomy suctioning in the community.",
      data: {
        correctOrder: [
          { id: "trach-s1", text: "Assess the need for suctioning: audible secretions, visible secretions, increased work of breathing, or desaturation" },
          { id: "trach-s2", text: "Explain the procedure to the patient and position upright or semi-upright" },
          { id: "trach-s3", text: "Perform hand hygiene, apply gloves and apron (eye protection if splash risk)" },
          { id: "trach-s4", text: "Pre-oxygenate if prescribed and check suction unit is functioning (set pressure 80–150mmHg)" },
          { id: "trach-s5", text: "Select correct size suction catheter (no more than half the internal diameter of the tracheostomy tube)" },
          { id: "trach-s6", text: "Using clean/aseptic technique, insert catheter gently without applying suction until resistance is felt, then withdraw 1cm" },
          { id: "trach-s7", text: "Apply suction intermittently while withdrawing catheter with a rotating motion; limit to 10–15 seconds" },
          { id: "trach-s8", text: "Allow the patient to recover between passes; monitor SpO2 throughout" },
          { id: "trach-s9", text: "Dispose of catheter, clear tubing with sterile water, and perform hand hygiene" },
          { id: "trach-s10", text: "Document: secretion amount, colour, consistency, patient tolerance, and SpO2 readings" },
        ],
        distractors: [
          { id: "trach-d1", text: "Apply suction while inserting the catheter to clear secretions faster", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Applying suction during insertion causes mucosal trauma, hypoxia, and vagal stimulation" },
        ],
      },
    },
    {
      id: "trach-decision-1",
      type: "decision",
      title: "Emergency Tracheostomy: Blocked Tube",
      description: "Manage an emergency scenario of a blocked tracheostomy tube in the community.",
      data: {
        startNodeId: "trach-d-n1",
        nodes: [
          {
            id: "trach-d-n1",
            prompt: "You arrive at a patient's home and find them distressed, unable to breathe through their tracheostomy. Suction is unsuccessful and the inner cannula cannot be cleared. What is your immediate action?",
            options: [
              { id: "trach-d-o1a", text: "Continue suctioning with a larger catheter", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Using a larger catheter risks mucosal damage and does not address a blocked tube; the inner cannula must be removed", feedback: "If suction fails, remove the inner cannula immediately." },
              { id: "trach-d-o1b", text: "Remove the inner cannula immediately to relieve the obstruction, call 999, and attempt to ventilate through the outer tube", isCorrect: true, nextNodeId: "trach-d-n2", feedback: "Correct. Removing the inner cannula is the first step in the emergency tracheostomy algorithm." },
              { id: "trach-d-o1c", text: "Call 999 and wait for the ambulance without intervening", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A completely blocked tracheostomy is life-threatening; waiting without intervention risks hypoxic cardiac arrest", feedback: "This is a life-threatening emergency. Intervene immediately while calling 999." },
            ],
          },
          {
            id: "trach-d-n2",
            prompt: "After removing the inner cannula, the patient is still unable to breathe effectively through the tracheostomy. SpO2 is dropping rapidly. What is your next step?",
            options: [
              { id: "trach-d-o2a", text: "Remove the entire tracheostomy tube if trained to do so, cover the stoma, and attempt bag-valve-mask ventilation via the mouth and nose", isCorrect: true, feedback: "Correct. Follow the emergency tracheostomy algorithm: if the tube is blocked and cannot be cleared, remove it and attempt oral ventilation." },
              { id: "trach-d-o2b", text: "Try to force air through the tracheostomy tube using a bag-valve device", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Forcing air through a blocked tube is ineffective and delays life-saving intervention", feedback: "If the tube is blocked, remove it. Do not force air through an obstruction." },
            ],
          },
        ],
      },
    },
  ],
};

export const peakFlowContent: ScenarioContent = {
  tasks: [
    {
      id: "pf-ordering-1",
      type: "ordering",
      title: "Peak Flow Monitoring",
      description: "Arrange the steps for performing peak expiratory flow rate measurement.",
      data: {
        correctOrder: [
          { id: "pf-s1", text: "Explain the procedure and purpose of peak flow monitoring to the patient" },
          { id: "pf-s2", text: "Ensure the patient is standing or sitting upright" },
          { id: "pf-s3", text: "Attach a clean mouthpiece to the peak flow meter and set the marker to zero" },
          { id: "pf-s4", text: "Instruct the patient to take a deep breath in, seal lips around the mouthpiece" },
          { id: "pf-s5", text: "Ask the patient to blow out as hard and fast as possible in one short sharp blast" },
          { id: "pf-s6", text: "Record the reading; reset the marker to zero" },
          { id: "pf-s7", text: "Repeat the process two more times (three readings total)" },
          { id: "pf-s8", text: "Record the highest of the three readings in the peak flow diary" },
          { id: "pf-s9", text: "Compare the result to the patient's personal best and assess the traffic light zone" },
        ],
        distractors: [
          { id: "pf-d1", text: "Record the average of the three readings", isDistractor: true, errorClassification: "MINOR", errorRationale: "Peak flow measurement records the highest (best) of three readings, not the average" },
        ],
      },
    },
    {
      id: "pf-decision-1",
      type: "decision",
      title: "Peak Flow Zones & Action Plans",
      description: "Interpret peak flow readings and determine appropriate actions based on traffic light zones.",
      data: {
        startNodeId: "pf-d-n1",
        nodes: [
          {
            id: "pf-d-n1",
            prompt: "A patient's best peak flow reading today is 240 L/min. Their personal best is 400 L/min. This is 60% of personal best. Which zone does this fall into and what action should be taken?",
            options: [
              { id: "pf-d-o1a", text: "Green zone (80–100%): continue usual treatment", isCorrect: false, errorClassification: "MAJOR", errorRationale: "60% is amber/yellow zone, not green; failing to recognise worsening asthma delays necessary treatment changes", feedback: "60% of personal best is in the amber zone, indicating worsening asthma control." },
              { id: "pf-d-o1b", text: "Amber zone (50–80%): increase treatment as per asthma action plan, monitor closely, and contact GP if not improving", isCorrect: true, nextNodeId: "pf-d-n2", feedback: "Correct. 60% is amber zone. Follow the patient's asthma action plan and arrange medical review." },
              { id: "pf-d-o1c", text: "Red zone (below 50%): call 999 immediately", isCorrect: false, errorClassification: "MINOR", errorRationale: "60% is above the red zone threshold of 50%; over-escalation wastes emergency resources", feedback: "60% is amber zone, not red. Follow the action plan and arrange GP review." },
            ],
          },
          {
            id: "pf-d-n2",
            prompt: "The following morning, the patient's peak flow has dropped further to 180 L/min (45% of personal best) and they are struggling to complete sentences. What do you do?",
            options: [
              { id: "pf-d-o2a", text: "Increase reliever inhaler frequency and call the GP surgery when it opens", isCorrect: false, errorClassification: "MAJOR", errorRationale: "45% of personal best with inability to complete sentences is a severe asthma attack requiring emergency intervention", feedback: "This is a medical emergency. Call 999 immediately." },
              { id: "pf-d-o2b", text: "Call 999 immediately. Give salbutamol via spacer (10 puffs), sit patient upright, stay calm, and monitor until help arrives", isCorrect: true, feedback: "Correct. This is a severe/life-threatening asthma attack. Emergency services are required." },
            ],
          },
        ],
      },
    },
    {
      id: "pf-matching-1",
      type: "matching",
      title: "Inhaler Devices & Techniques",
      description: "Match each inhaler device type to the correct technique description.",
      data: {
        pairs: [
          { left: { id: "pf-m-l1", text: "Metered Dose Inhaler (MDI) with spacer" }, right: { id: "pf-m-r1", text: "Shake inhaler, attach to spacer, seal lips around mouthpiece, press canister and take slow deep breath in, hold breath for 10 seconds" } },
          { left: { id: "pf-m-l2", text: "Dry Powder Inhaler (DPI) e.g. Turbohaler" }, right: { id: "pf-m-r2", text: "Hold upright, twist base to load dose, breathe out away from device, seal lips and breathe in fast and deep, hold breath for 10 seconds" } },
          { left: { id: "pf-m-l3", text: "Soft Mist Inhaler (Respimat)" }, right: { id: "pf-m-r3", text: "Turn base half-turn until click, open cap, breathe out slowly, seal lips and press dose-release button while breathing in slowly and deeply" } },
          { left: { id: "pf-m-l4", text: "Accuhaler (Diskus)" }, right: { id: "pf-m-r4", text: "Open device, slide lever to load dose, breathe out away from device, seal lips and breathe in steadily and deeply, hold for 10 seconds" } },
        ],
      },
    },
  ],
};

export const catheterisationContent: ScenarioContent = {
  tasks: [
    {
      id: "cath-ordering-1",
      type: "ordering",
      title: "Female Urinary Catheterisation (Aseptic Technique)",
      description: "Arrange the steps for performing female urinary catheterisation using aseptic technique.",
      data: {
        correctOrder: [
          { id: "cath-s1", text: "Check prescription and indication for catheterisation; obtain informed consent" },
          { id: "cath-s2", text: "Gather equipment: catheter (appropriate size and type), catheter pack, sterile gloves, anaesthetic gel, drainage bag, sterile water for balloon" },
          { id: "cath-s3", text: "Ensure privacy and position the patient supine with knees bent and apart" },
          { id: "cath-s4", text: "Perform hand hygiene, open catheter pack, and create sterile field using ANTT principles" },
          { id: "cath-s5", text: "Put on sterile gloves; clean the urethral meatus with sterile saline using single downward strokes" },
          { id: "cath-s6", text: "Instil anaesthetic/lubricant gel into the urethra; wait 3–5 minutes for effect" },
          { id: "cath-s7", text: "Insert catheter gently into the urethra until urine drains" },
          { id: "cath-s8", text: "Advance catheter a further 5cm beyond first drainage of urine to ensure balloon is in the bladder" },
          { id: "cath-s9", text: "Inflate balloon with the prescribed volume of sterile water" },
          { id: "cath-s10", text: "Gently withdraw catheter until resistance is felt (balloon sitting at bladder neck)" },
          { id: "cath-s11", text: "Connect drainage bag and secure catheter to thigh with a catheter strap" },
          { id: "cath-s12", text: "Document: catheter type, size, balloon volume, residual volume, batch number, and patient tolerance" },
        ],
        distractors: [
          { id: "cath-d1", text: "Inflate the balloon as soon as urine appears in the catheter", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Inflating the balloon in the urethra causes trauma and pain; the catheter must be advanced beyond first urine drainage" },
        ],
      },
    },
    {
      id: "cath-decision-1",
      type: "decision",
      title: "Catheter Insertion Complications",
      description: "Manage complications during urinary catheterisation.",
      data: {
        startNodeId: "cath-d-n1",
        nodes: [
          {
            id: "cath-d-n1",
            prompt: "During catheterisation, you insert the catheter to its full length but no urine drains. The patient is not in discomfort. What do you do?",
            options: [
              { id: "cath-d-o1a", text: "Force the catheter further to ensure it reaches the bladder", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Forcing a catheter risks urethral perforation and false passage creation", feedback: "Never force a catheter. Stop and reassess." },
              { id: "cath-d-o1b", text: "Ask the patient to cough or apply gentle suprapubic pressure. If still no urine, consider the patient may have an empty bladder, or that the catheter is misplaced. Do not inflate balloon. Remove and reassess", isCorrect: true, nextNodeId: "cath-d-n2", feedback: "Correct. Never inflate the balloon without confirmed urine drainage. Reassess the situation." },
              { id: "cath-d-o1c", text: "Inflate the balloon anyway to hold the catheter in place and wait", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Inflating a balloon without confirming bladder placement risks urethral injury", feedback: "Never inflate the balloon unless you have confirmed the catheter is in the bladder by urine drainage." },
            ],
          },
          {
            id: "cath-d-n2",
            prompt: "On the second attempt with a new catheter, frank blood drains from the catheter. What do you do?",
            options: [
              { id: "cath-d-o2a", text: "Continue with catheterisation as some blood is normal", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Frank blood suggests urethral trauma; continuing risks worsening injury", feedback: "Stop immediately. Frank blood is not normal during catheterisation." },
              { id: "cath-d-o2b", text: "Stop the procedure immediately, do not inflate the balloon, remove the catheter gently, apply pressure if bleeding, document, and escalate to a senior clinician or urologist", isCorrect: true, feedback: "Correct. Frank blood indicates potential trauma. Stop, manage, and escalate urgently." },
            ],
          },
        ],
      },
    },
  ],
};

export const catheterMaintenanceContent: ScenarioContent = {
  tasks: [
    {
      id: "cm-ordering-1",
      type: "ordering",
      title: "Catheter Care & Drainage Bag Change",
      description: "Arrange the steps for routine catheter care and drainage bag change.",
      data: {
        correctOrder: [
          { id: "cm-s1", text: "Explain procedure to patient and ensure privacy" },
          { id: "cm-s2", text: "Perform hand hygiene and apply non-sterile gloves and apron" },
          { id: "cm-s3", text: "Assess the catheter site: check for signs of infection, encrustation, or meatal irritation" },
          { id: "cm-s4", text: "Clean the meatal area with soap and water, cleaning away from the urethral opening" },
          { id: "cm-s5", text: "Ensure catheter is not pulling or kinked; reposition catheter strap if needed" },
          { id: "cm-s6", text: "Empty the current drainage bag using a clean container; note volume" },
          { id: "cm-s7", text: "If bag change is due (every 5–7 days per policy), use ANTT to disconnect old bag and connect new bag" },
          { id: "cm-s8", text: "Ensure bag is positioned below bladder level and tubing is not kinked" },
          { id: "cm-s9", text: "Dispose of old bag and equipment appropriately" },
          { id: "cm-s10", text: "Document: urine output, appearance, catheter site assessment, bag change, and any concerns" },
        ],
        distractors: [
          { id: "cm-d1", text: "Routinely instil antiseptic solution into the catheter bag to prevent infection", isDistractor: true, errorClassification: "MINOR", errorRationale: "Adding antiseptic to drainage bags is not evidence-based and not recommended by NICE or EPIC guidelines" },
        ],
      },
    },
    {
      id: "cm-decision-1",
      type: "decision",
      title: "Managing Catheter Blockage & UTI Signs",
      description: "Manage catheter complications including blockage, bypassing, and urinary tract infection signs.",
      data: {
        startNodeId: "cm-d-n1",
        nodes: [
          {
            id: "cm-d-n1",
            prompt: "During a visit, the patient reports no urine has drained into the bag for 6 hours. They have suprapubic discomfort. The catheter bag is empty and the tubing appears kinked. What do you do first?",
            options: [
              { id: "cm-d-o1a", text: "Remove the catheter and reinsert a new one", isCorrect: false, errorClassification: "MINOR", errorRationale: "Check for simple mechanical causes before recatheterisation; a kinked tube may be the sole cause", feedback: "Check for simple mechanical causes first. Unkink the tubing and reassess." },
              { id: "cm-d-o1b", text: "Unkink the tubing, reposition the bag below bladder level, and observe for urine flow", isCorrect: true, nextNodeId: "cm-d-n2", feedback: "Correct. Always check for mechanical causes first: kinks, loops, bag height, and catheter position." },
            ],
          },
          {
            id: "cm-d-n2",
            prompt: "After unkinking, some urine drains but it is cloudy, foul-smelling, and the patient has a temperature of 38.2°C. What do you do?",
            options: [
              { id: "cm-d-o2a", text: "Advise increased fluids and review in 48 hours", isCorrect: false, errorClassification: "MINOR", errorRationale: "A symptomatic catheter-associated UTI with pyrexia requires medical assessment and likely antibiotics, not watchful waiting alone", feedback: "Symptomatic CAUTI with pyrexia needs urgent medical review." },
              { id: "cm-d-o2b", text: "Obtain a catheter specimen of urine (CSU) from the sampling port, contact GP for review, document findings, and advise the patient on fluid intake", isCorrect: true, feedback: "Correct. Obtain CSU, escalate for medical review, and document. Do not delay treatment in a pyrexial patient." },
            ],
          },
        ],
      },
    },
  ],
};

export const suprapubicContent: ScenarioContent = {
  tasks: [
    {
      id: "spc-ordering-1",
      type: "ordering",
      title: "Suprapubic Catheter Site Care",
      description: "Arrange the steps for suprapubic catheter site care in the community.",
      data: {
        correctOrder: [
          { id: "spc-s1", text: "Explain procedure to the patient and ensure privacy" },
          { id: "spc-s2", text: "Perform hand hygiene and apply clean gloves and apron" },
          { id: "spc-s3", text: "Inspect the suprapubic insertion site for signs of infection, granulation, or leakage" },
          { id: "spc-s4", text: "Clean the site with sterile saline or warm water, using circular motions from the catheter outwards" },
          { id: "spc-s5", text: "Gently dry the site with sterile gauze" },
          { id: "spc-s6", text: "Apply a suitable dressing if required (some established sites may not require a dressing)" },
          { id: "spc-s7", text: "Ensure catheter is secured and drainage bag is below bladder level" },
          { id: "spc-s8", text: "Document: site condition, urine output, any concerns, and next review date" },
        ],
        distractors: [
          { id: "spc-d1", text: "Rotate the catheter 360° at each visit to prevent tract adhesion", isDistractor: true, errorClassification: "MINOR", errorRationale: "Routine rotation of suprapubic catheters is not evidence-based and may cause discomfort or tract irritation" },
        ],
      },
    },
    {
      id: "spc-decision-1",
      type: "decision",
      title: "Suprapubic Catheter Complications",
      description: "Recognise and manage complications of suprapubic catheters.",
      data: {
        startNodeId: "spc-d-n1",
        nodes: [
          {
            id: "spc-d-n1",
            prompt: "During a routine visit, you notice the suprapubic catheter has fallen out. The tract is well-established (catheter has been in situ for 6 months). What do you do?",
            options: [
              { id: "spc-d-o1a", text: "Clean the site and apply a dressing; arrange reinsertion at the next clinic appointment", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A suprapubic tract can close within hours; delay risks losing the tract and requiring surgical reinsertion", feedback: "The tract can close within hours. This needs urgent reinsertion." },
              { id: "spc-d-o1b", text: "Cover the site with a sterile dressing, contact the specialist team or on-call urologist urgently for reinsertion, and document", isCorrect: true, nextNodeId: "spc-d-n2", feedback: "Correct. Suprapubic catheter dislodgement requires urgent specialist review for reinsertion before the tract closes." },
            ],
          },
          {
            id: "spc-d-n2",
            prompt: "The site around the catheter is erythematous, warm, and purulent discharge is present. The patient has a temperature of 38.5°C. What do you do?",
            options: [
              { id: "spc-d-o2a", text: "Clean the site more thoroughly with antiseptic and apply a new dressing", isCorrect: false, errorClassification: "MINOR", errorRationale: "Signs of site infection with systemic symptoms require medical review and likely antibiotics, not just local wound care", feedback: "This patient has signs of local and systemic infection. Medical review is needed." },
              { id: "spc-d-o2b", text: "Clean the site, take a wound swab, arrange urgent GP review for antibiotic consideration, document findings, and advise the patient on signs of deterioration", isCorrect: true, feedback: "Correct. Site infection with pyrexia requires wound swab, escalation, and urgent medical review." },
            ],
          },
        ],
      },
    },
  ],
};

export const bowelManagementContent: ScenarioContent = {
  tasks: [
    {
      id: "bm-ordering-1",
      type: "ordering",
      title: "Digital Rectal Examination",
      description: "Arrange the steps for performing a digital rectal examination (DRE) in the community.",
      data: {
        correctOrder: [
          { id: "bm-s1", text: "Check clinical indication and ensure competency to perform DRE; obtain informed consent" },
          { id: "bm-s2", text: "Ensure privacy and use a chaperone where possible" },
          { id: "bm-s3", text: "Position the patient in left lateral position with knees drawn up" },
          { id: "bm-s4", text: "Perform hand hygiene and apply gloves and apron" },
          { id: "bm-s5", text: "Inspect the perianal area for haemorrhoids, fissures, skin tags, or excoriation" },
          { id: "bm-s6", text: "Lubricate gloved index finger generously" },
          { id: "bm-s7", text: "Ask the patient to bear down gently and insert finger slowly into the rectum" },
          { id: "bm-s8", text: "Assess: presence, amount, and consistency of stool; anal tone; any masses or abnormalities" },
          { id: "bm-s9", text: "Withdraw finger gently; clean the patient and ensure comfort" },
          { id: "bm-s10", text: "Document findings: stool type (Bristol Stool Chart), amount, rectal loading, and any abnormalities" },
        ],
        distractors: [
          { id: "bm-d1", text: "Proceed with DRE if the patient is on anticoagulants without checking with the prescriber", isDistractor: true, errorClassification: "MAJOR", errorRationale: "DRE in anticoagulated patients carries increased bleeding risk; prescriber guidance must be sought" },
        ],
      },
    },
    {
      id: "bm-decision-1",
      type: "decision",
      title: "Managing Constipation & Bowel Care Plans",
      description: "Manage constipation and develop appropriate bowel care plans.",
      data: {
        startNodeId: "bm-d-n1",
        nodes: [
          {
            id: "bm-d-n1",
            prompt: "A community patient has not opened their bowels for 7 days. They have abdominal distension and discomfort. On DRE, the rectum is loaded with hard stool. What is your management plan?",
            options: [
              { id: "bm-d-o1a", text: "Advise increased fluids and fibre and review in a week", isCorrect: false, errorClassification: "MINOR", errorRationale: "With a loaded rectum and 7 days of constipation, dietary advice alone is insufficient; active intervention is needed", feedback: "Dietary advice is part of ongoing management but the loaded rectum needs active treatment." },
              { id: "bm-d-o1b", text: "Administer prescribed suppositories or enema as per bowel care protocol, ensure adequate hydration, review laxative prescription with GP, and document", isCorrect: true, nextNodeId: "bm-d-n2", feedback: "Correct. A loaded rectum requires active intervention plus a review of the overall bowel management plan." },
              { id: "bm-d-o1c", text: "Perform digital removal of faeces immediately", isCorrect: false, errorClassification: "MINOR", errorRationale: "DRF should only be performed after less invasive measures have failed, using a clear clinical pathway and consent", feedback: "DRF is a last resort after suppositories/enemas have been tried. Follow the bowel care pathway." },
            ],
          },
          {
            id: "bm-d-n2",
            prompt: "After administering a phosphate enema as prescribed, the patient complains of severe cramping abdominal pain, and you notice rectal bleeding. What do you do?",
            options: [
              { id: "bm-d-o2a", text: "This is a normal response to the enema; reassure the patient", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Severe pain and rectal bleeding after an enema could indicate rectal perforation or mucosal damage, requiring urgent assessment", feedback: "Severe pain with bleeding is not normal. This requires urgent medical assessment." },
              { id: "bm-d-o2b", text: "Stop any further intervention, monitor the patient, call for urgent medical review, document the incident, and complete a clinical incident report", isCorrect: true, feedback: "Correct. Severe pain with rectal bleeding requires immediate escalation and medical review." },
            ],
          },
        ],
      },
    },
  ],
};

export const pressureUlcerContent: ScenarioContent = {
  tasks: [
    {
      id: "pu-ordering-1",
      type: "ordering",
      title: "Comprehensive Skin Assessment",
      description: "Arrange the steps for conducting a comprehensive skin assessment using Waterlow/PURPOSE-T.",
      data: {
        correctOrder: [
          { id: "pu-s1", text: "Explain the assessment to the patient and obtain consent" },
          { id: "pu-s2", text: "Gather assessment tools: PURPOSE-T/Waterlow score chart, measuring tape, camera (if consent given)" },
          { id: "pu-s3", text: "Assess risk factors: mobility, nutrition, continence, age, weight, skin type, and medical conditions" },
          { id: "pu-s4", text: "Perform a full body skin inspection including all bony prominences (sacrum, heels, ischial tuberosities, trochanters)" },
          { id: "pu-s5", text: "Check for non-blanching erythema using finger/diascopy test on intact skin" },
          { id: "pu-s6", text: "Document any skin damage: location, size, depth, wound bed, and classify using pressure ulcer categories" },
          { id: "pu-s7", text: "Complete the Waterlow or PURPOSE-T assessment tool and calculate risk score" },
          { id: "pu-s8", text: "Implement appropriate interventions: pressure-relieving equipment, repositioning schedule, nutrition optimisation" },
          { id: "pu-s9", text: "Document all findings, plan of care, and referral if needed; set review date" },
        ],
        distractors: [
          { id: "pu-d1", text: "Massage reddened areas over bony prominences to improve circulation", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Massage over bony prominences or non-blanching erythema causes further tissue damage and is contraindicated" },
        ],
      },
    },
    {
      id: "pu-decision-1",
      type: "decision",
      title: "Pressure Ulcer Classification & Escalation",
      description: "Classify pressure ulcers and determine appropriate escalation pathways.",
      data: {
        startNodeId: "pu-d-n1",
        nodes: [
          {
            id: "pu-d-n1",
            prompt: "During a skin assessment, you find a 3cm x 2cm area of non-blanching erythema over the sacrum. The skin is intact but warm and firm. What category is this and what do you do?",
            options: [
              { id: "pu-d-o1a", text: "Category 1 pressure ulcer. Document, implement pressure-relieving measures, increase repositioning frequency, and arrange review", isCorrect: true, nextNodeId: "pu-d-n2", feedback: "Correct. Non-blanching erythema with intact skin is Category 1. Early intervention prevents deterioration." },
              { id: "pu-d-o1b", text: "This is just redness from lying down; no action needed, it will resolve", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Non-blanching erythema is a Category 1 pressure ulcer requiring immediate intervention; ignoring it risks progression", feedback: "Non-blanching erythema is a pressure ulcer. It requires immediate intervention." },
              { id: "pu-d-o1c", text: "Apply a dressing to protect the area", isCorrect: false, errorClassification: "MINOR", errorRationale: "Dressings are not the primary intervention for Category 1; pressure relief and repositioning are priorities", feedback: "Category 1 requires pressure relief and repositioning. Barrier creams may protect, but dressings are not first-line." },
            ],
          },
          {
            id: "pu-d-n2",
            prompt: "One week later, the area has deteriorated. There is now a shallow open wound with a red/pink wound bed and no slough. What category is this?",
            options: [
              { id: "pu-d-o2a", text: "Category 2 pressure ulcer. Document deterioration, apply appropriate dressing, review pressure-relieving interventions, escalate to tissue viability nurse if available", isCorrect: true, feedback: "Correct. A shallow ulcer with a red/pink wound bed and no slough or eschar is Category 2." },
              { id: "pu-d-o2b", text: "Moisture lesion from incontinence. Increase pad changes", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Misclassification of a pressure ulcer as a moisture lesion delays appropriate treatment and reporting", feedback: "This is in a pressure area and has developed from a Category 1 finding. It is a pressure ulcer." },
            ],
          },
        ],
      },
    },
    {
      id: "pu-matching-1",
      type: "matching",
      title: "Pressure Ulcer Category Matching",
      description: "Match wound descriptions to the correct pressure ulcer category.",
      data: {
        pairs: [
          { left: { id: "pu-m-l1", text: "Non-blanching erythema, intact skin, warm and discoloured" }, right: { id: "pu-m-r1", text: "Category 1" } },
          { left: { id: "pu-m-l2", text: "Shallow open ulcer, red/pink wound bed, no slough, may present as blister" }, right: { id: "pu-m-r2", text: "Category 2" } },
          { left: { id: "pu-m-l3", text: "Full-thickness skin loss, subcutaneous fat visible, slough present, bone/tendon NOT exposed" }, right: { id: "pu-m-r3", text: "Category 3" } },
          { left: { id: "pu-m-l4", text: "Full-thickness tissue loss with exposed bone, tendon, or muscle" }, right: { id: "pu-m-r4", text: "Category 4" } },
        ],
      },
    },
  ],
};

export const compressionContent: ScenarioContent = {
  tasks: [
    {
      id: "comp-ordering-1",
      type: "ordering",
      title: "Applying Compression Bandaging",
      description: "Arrange the steps for applying compression bandaging for a venous leg ulcer.",
      data: {
        correctOrder: [
          { id: "comp-s1", text: "Confirm ABPI result is within safe range (≥0.8) and compression is prescribed" },
          { id: "comp-s2", text: "Assess the wound: measure, photograph (if consent given), document wound bed and exudate" },
          { id: "comp-s3", text: "Clean the wound with warmed sterile saline or as per wound care plan" },
          { id: "comp-s4", text: "Apply appropriate primary wound dressing" },
          { id: "comp-s5", text: "Apply wool padding from toe to knee, ensuring even coverage with no gaps or bunching" },
          { id: "comp-s6", text: "Apply compression bandage using correct technique: 50% overlap, figure-of-eight at ankle, from toe to knee" },
          { id: "comp-s7", text: "Ensure toes are visible to monitor circulation; check for comfort and movement" },
          { id: "comp-s8", text: "Advise patient on leg elevation, mobility, and when to seek help (pain, numbness, colour change in toes)" },
          { id: "comp-s9", text: "Document: wound assessment, dressings used, bandage type, and patient education given" },
        ],
        distractors: [
          { id: "comp-d1", text: "Apply compression bandaging without checking ABPI as the ulcer is clearly venous", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Applying compression without ABPI assessment risks limb ischaemia in patients with undetected peripheral arterial disease" },
        ],
      },
    },
    {
      id: "comp-decision-1",
      type: "decision",
      title: "ABPI Assessment & Contraindications",
      description: "Interpret ABPI results and identify contraindications to compression therapy.",
      data: {
        startNodeId: "comp-d-n1",
        nodes: [
          {
            id: "comp-d-n1",
            prompt: "You perform an ABPI assessment on a patient with a leg ulcer. The highest ankle pressure is 90mmHg and the highest brachial pressure is 140mmHg. The ABPI is 0.64. What does this indicate?",
            options: [
              { id: "comp-d-o1a", text: "Normal arterial circulation; proceed with full compression", isCorrect: false, errorClassification: "MAJOR", errorRationale: "An ABPI of 0.64 indicates significant peripheral arterial disease; full compression is contraindicated and risks limb ischaemia", feedback: "An ABPI below 0.8 indicates arterial insufficiency. Full compression is contraindicated." },
              { id: "comp-d-o1b", text: "Significant peripheral arterial disease. Do not apply full compression. Refer to vascular team for assessment and consider reduced compression only under specialist guidance", isCorrect: true, nextNodeId: "comp-d-n2", feedback: "Correct. ABPI below 0.8 indicates PAD. Full compression is contraindicated. Specialist referral is needed." },
              { id: "comp-d-o1c", text: "Mild arterial disease; apply reduced compression at a lower level", isCorrect: false, errorClassification: "MINOR", errorRationale: "Reduced compression should only be applied under specialist guidance, not independently initiated", feedback: "Reduced compression requires specialist assessment and guidance." },
            ],
          },
          {
            id: "comp-d-n2",
            prompt: "Another patient has an ABPI of 1.4. What does this suggest?",
            options: [
              { id: "comp-d-o2a", text: "Excellent arterial supply; proceed with full compression", isCorrect: false, errorClassification: "MAJOR", errorRationale: "ABPI above 1.3 suggests calcified, incompressible arteries (common in diabetes); the result is unreliable and requires further vascular assessment", feedback: "An ABPI above 1.3 is falsely elevated due to arterial calcification. Further assessment is needed." },
              { id: "comp-d-o2b", text: "Falsely elevated result likely due to arterial calcification. Refer for toe pressure or duplex scan assessment before applying compression", isCorrect: true, feedback: "Correct. ABPI above 1.3 suggests incompressible arteries. Alternative vascular assessment is needed." },
            ],
          },
        ],
      },
    },
    {
      id: "comp-calc-1",
      type: "calculation",
      title: "ABPI Calculation",
      description: "Calculate the ankle-brachial pressure index.",
      data: {
        question: "The highest ankle systolic pressure is 110mmHg. The highest brachial systolic pressure is 135mmHg. Calculate the ABPI.",
        formula: "ABPI = Highest ankle systolic pressure ÷ Highest brachial systolic pressure",
        inputs: { "Ankle pressure (mmHg)": 110, "Brachial pressure (mmHg)": 135 },
        correctAnswer: 0.81,
        tolerance: 0.02,
        unit: "ratio",
        errorClassification: "MAJOR",
        errorRationale: "Incorrect ABPI calculation could lead to inappropriate compression therapy, risking limb ischaemia or delayed treatment",
      },
    },
  ],
};

export const skinTearContent: ScenarioContent = {
  tasks: [
    {
      id: "st-ordering-1",
      type: "ordering",
      title: "Managing a Skin Tear",
      description: "Arrange the steps for managing a skin tear using the ISTAP classification.",
      data: {
        correctOrder: [
          { id: "st-s1", text: "Control any bleeding with gentle pressure using a clean/sterile pad" },
          { id: "st-s2", text: "Clean the wound gently with warmed sterile saline; avoid vigorous rubbing" },
          { id: "st-s3", text: "If a skin flap is present, gently realign it using a moistened gloved finger or damp gauze" },
          { id: "st-s4", text: "Classify the skin tear using ISTAP: Type 1 (no skin loss), Type 2 (partial flap loss), or Type 3 (total flap loss)" },
          { id: "st-s5", text: "Apply a non-adherent primary dressing (e.g. silicone-based) to protect the flap" },
          { id: "st-s6", text: "Apply a secondary dressing if needed; avoid adhesive tape directly on fragile skin" },
          { id: "st-s7", text: "Mark the direction of the skin flap on the dressing with an arrow" },
          { id: "st-s8", text: "Document: ISTAP classification, wound size, treatment, and plan; photograph if consent given" },
        ],
        distractors: [
          { id: "st-d1", text: "Use adhesive wound closure strips (Steri-Strips) directly on the fragile peri-wound skin", isDistractor: true, errorClassification: "MINOR", errorRationale: "Adhesive strips on fragile skin risk further skin tears on removal; use silicone-based products instead" },
        ],
      },
    },
    {
      id: "st-decision-1",
      type: "decision",
      title: "ISTAP Classification & Dressing Selection",
      description: "Classify skin tears and select appropriate dressings.",
      data: {
        startNodeId: "st-d-n1",
        nodes: [
          {
            id: "st-d-n1",
            prompt: "A patient has a linear skin tear on their forearm. The skin flap is present and can be repositioned to cover the wound bed with no missing skin. What is the ISTAP classification?",
            options: [
              { id: "st-d-o1a", text: "Type 1: No skin loss, linear or flap tear that can be repositioned to cover the wound bed", isCorrect: true, nextNodeId: "st-d-n2", feedback: "Correct. Type 1 has no skin loss and the flap can fully cover the wound." },
              { id: "st-d-o1b", text: "Type 2: Partial flap loss", isCorrect: false, errorClassification: "MINOR", errorRationale: "The flap fully covers the wound bed, making this Type 1 not Type 2", feedback: "If the flap fully covers the wound, it is Type 1." },
              { id: "st-d-o1c", text: "Type 3: Total flap loss", isCorrect: false, errorClassification: "MAJOR", errorRationale: "The flap is present and can be repositioned; misclassifying as Type 3 may lead to inappropriate treatment", feedback: "The flap is present. Type 3 refers to total absence of the skin flap." },
            ],
          },
          {
            id: "st-d-n2",
            prompt: "What dressing would be most appropriate for this Type 1 skin tear?",
            options: [
              { id: "st-d-o2a", text: "A bulky absorbent dressing secured with adhesive tape", isCorrect: false, errorClassification: "MINOR", errorRationale: "Adhesive tape on fragile skin risks further injury; bulky dressings may displace the flap", feedback: "Avoid adhesive tape on fragile skin. Use silicone-based, non-adherent dressings." },
              { id: "st-d-o2b", text: "A silicone-based non-adherent dressing, secured with tubular bandage or light cohesive wrap; leave in situ for 5–7 days unless clinically indicated", isCorrect: true, feedback: "Correct. Silicone dressings protect the flap without causing trauma on removal." },
            ],
          },
        ],
      },
    },
  ],
};

export const bgmContent: ScenarioContent = {
  tasks: [
    {
      id: "bgm-ordering-1",
      type: "ordering",
      title: "Blood Glucose Testing",
      description: "Arrange the steps for performing a capillary blood glucose test.",
      data: {
        correctOrder: [
          { id: "bgm-s1", text: "Check the reason for testing and prescribed target range" },
          { id: "bgm-s2", text: "Confirm patient identity and explain the procedure" },
          { id: "bgm-s3", text: "Ensure the patient's hands are clean and warm; wash with soap and water if available" },
          { id: "bgm-s4", text: "Perform hand hygiene and apply gloves" },
          { id: "bgm-s5", text: "Check glucometer is calibrated and test strip is in date; insert test strip" },
          { id: "bgm-s6", text: "Select the side of a fingertip (avoid thumb and index finger); use a single-use lancet" },
          { id: "bgm-s7", text: "Pierce the skin and obtain an adequate drop of blood without squeezing excessively" },
          { id: "bgm-s8", text: "Apply blood to the test strip and wait for the result" },
          { id: "bgm-s9", text: "Dispose of lancet into sharps container and apply pressure to puncture site" },
          { id: "bgm-s10", text: "Record result, compare to target range, and take appropriate action" },
        ],
        distractors: [
          { id: "bgm-d1", text: "Use an alcohol swab to clean the finger immediately before lancing", isDistractor: true, errorClassification: "MINOR", errorRationale: "Alcohol can affect blood glucose readings and cause stinging; hand washing with soap and water is preferred" },
        ],
      },
    },
    {
      id: "bgm-decision-1",
      type: "decision",
      title: "Interpreting BG Results & Managing Hypo/Hyperglycaemia",
      description: "Interpret blood glucose results and manage abnormal readings.",
      data: {
        startNodeId: "bgm-d-n1",
        nodes: [
          {
            id: "bgm-d-n1",
            prompt: "A patient's blood glucose reading is 3.5 mmol/L. They are conscious and able to swallow. They feel tremulous and sweaty. What do you do?",
            options: [
              { id: "bgm-d-o1a", text: "Give them their insulin and then treat the low sugar", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Administering insulin during hypoglycaemia will worsen the episode; treat hypo first", feedback: "Never give insulin during hypoglycaemia. Treat the low blood glucose first." },
              { id: "bgm-d-o1b", text: "Give fast-acting glucose (e.g. 150–200ml fruit juice or 4–5 glucose tablets), recheck BG in 10–15 minutes, follow with a long-acting carbohydrate snack once BG above 4 mmol/L", isCorrect: true, nextNodeId: "bgm-d-n2", feedback: "Correct. Follow the hypo treatment protocol: fast-acting glucose, recheck, then sustain with long-acting carbohydrate." },
            ],
          },
          {
            id: "bgm-d-n2",
            prompt: "Another patient has a blood glucose of 28 mmol/L. They are drowsy, have deep rapid breathing, and their breath smells fruity. What do you suspect and what do you do?",
            options: [
              { id: "bgm-d-o2a", text: "Hyperglycaemia that will resolve with their next insulin dose; document and review tomorrow", isCorrect: false, errorClassification: "MAJOR", errorRationale: "These are signs of diabetic ketoacidosis (DKA), a life-threatening emergency requiring immediate intervention", feedback: "These are signs of DKA. This is a medical emergency. Call 999 immediately." },
              { id: "bgm-d-o2b", text: "Suspect diabetic ketoacidosis (DKA). Call 999 immediately, keep patient safe, do not give insulin, monitor consciousness, and prepare handover", isCorrect: true, feedback: "Correct. Fruity breath, deep rapid breathing, and high BG suggest DKA, a medical emergency." },
            ],
          },
        ],
      },
    },
  ],
};

export const insulinAdminContent: ScenarioContent = {
  tasks: [
    {
      id: "ia-ordering-1",
      type: "ordering",
      title: "Insulin Pen Administration with Dose Check",
      description: "Arrange the steps for insulin pen administration including safety checks.",
      data: {
        correctOrder: [
          { id: "ia-s1", text: "Check prescription: insulin name, type (rapid/intermediate/long-acting/mixed), dose, and timing" },
          { id: "ia-s2", text: "Confirm patient identity using two identifiers" },
          { id: "ia-s3", text: "Check pre-dose blood glucose and compare to target range" },
          { id: "ia-s4", text: "Check insulin pen matches prescription: verify insulin type name, strength, and expiry" },
          { id: "ia-s5", text: "Check storage: pen in use kept at room temperature (max 28 days), spare pens in fridge" },
          { id: "ia-s6", text: "If suspension insulin, gently roll and invert pen 10 times each; inspect appearance" },
          { id: "ia-s7", text: "Attach new pen needle, perform 2-unit air shot to prime" },
          { id: "ia-s8", text: "Dial the prescribed dose; have second checker verify if available" },
          { id: "ia-s9", text: "Select injection site, rotate from last site, and administer at 90° into pinched skin fold" },
          { id: "ia-s10", text: "Hold for 10 seconds, withdraw needle, dispose of needle into sharps bin" },
          { id: "ia-s11", text: "Document: insulin type, dose, site, time, BG level, and any concerns" },
        ],
        distractors: [
          { id: "ia-d1", text: "Use the same pen needle for multiple patients to reduce waste", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Pen needles are single-use and single-patient devices; sharing creates cross-infection and needlestick injury risks" },
        ],
      },
    },
    {
      id: "ia-decision-1",
      type: "decision",
      title: "Insulin Safety & Sliding Scale Management",
      description: "Manage insulin safety scenarios in community nursing.",
      data: {
        startNodeId: "ia-d-n1",
        nodes: [
          {
            id: "ia-d-n1",
            prompt: "You arrive to administer insulin and notice the prescription says 'Humalog 36 units' but the patient has only a NovoRapid pen available. Both are rapid-acting insulins. What do you do?",
            options: [
              { id: "ia-d-o1a", text: "Administer NovoRapid 36 units as they are both rapid-acting and essentially the same", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Insulin should never be substituted without prescriber authorisation; different brands may have different pharmacokinetic profiles", feedback: "Never substitute insulins without prescriber authorisation, even within the same category." },
              { id: "ia-d-o1b", text: "Do not administer. Contact the prescriber to clarify the correct insulin, document the discrepancy, and ensure the correct insulin is made available", isCorrect: true, nextNodeId: "ia-d-n2", feedback: "Correct. Insulin must match the prescription exactly. Contact prescriber for any discrepancies." },
            ],
          },
          {
            id: "ia-d-n2",
            prompt: "The prescriber confirms NovoRapid and updates the prescription. However, you notice the patient's insulin pen has been left on the car dashboard in summer. It feels warm. What do you do?",
            options: [
              { id: "ia-d-o2a", text: "Use it anyway as insulin is quite stable", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Heat-exposed insulin may have reduced efficacy; administering it risks hyperglycaemia and potential DKA", feedback: "Insulin exposed to excessive heat should not be used." },
              { id: "ia-d-o2b", text: "Do not use this pen. Obtain a new pen from the patient's fridge supply, check it has been stored correctly, and advise the patient on proper insulin storage", isCorrect: true, feedback: "Correct. Heat-damaged insulin may be ineffective. Use a new pen from correct storage." },
            ],
          },
        ],
      },
    },
  ],
};

export const diabeticFootContent: ScenarioContent = {
  tasks: [
    {
      id: "df-ordering-1",
      type: "ordering",
      title: "Comprehensive Diabetic Foot Assessment",
      description: "Arrange the steps for performing a comprehensive diabetic foot assessment.",
      data: {
        correctOrder: [
          { id: "df-s1", text: "Review patient's diabetes history, HbA1c, previous foot problems, and vascular history" },
          { id: "df-s2", text: "Ask about current symptoms: pain, numbness, tingling, claudication, or recent changes" },
          { id: "df-s3", text: "Inspect both feet: skin condition, colour, temperature, deformities, callus, nail condition" },
          { id: "df-s4", text: "Check between the toes for skin breakdown, fungal infection, or maceration" },
          { id: "df-s5", text: "Assess neurological status using 10g monofilament testing at specified sites on each foot" },
          { id: "df-s6", text: "Assess peripheral pulses: dorsalis pedis and posterior tibial bilaterally" },
          { id: "df-s7", text: "Check for structural deformities: Charcot foot, hammer toes, bunions" },
          { id: "df-s8", text: "Assess footwear for appropriate fit and pressure points" },
          { id: "df-s9", text: "Classify risk level using NICE guidelines and determine review frequency" },
          { id: "df-s10", text: "Provide patient education on foot care, daily checking, and when to seek urgent help" },
          { id: "df-s11", text: "Document findings, risk category, and referral to podiatry if indicated" },
        ],
        distractors: [
          { id: "df-d1", text: "Soak the patient's feet in warm water to soften calluses during the assessment", isDistractor: true, errorClassification: "MINOR", errorRationale: "Foot soaking is not recommended for diabetic patients as it causes maceration and increases infection risk, especially with neuropathy" },
        ],
      },
    },
    {
      id: "df-decision-1",
      type: "decision",
      title: "Diabetic Foot Risk Stratification & Referral",
      description: "Stratify diabetic foot risk and make appropriate referral decisions.",
      data: {
        startNodeId: "df-d-n1",
        nodes: [
          {
            id: "df-d-n1",
            prompt: "A patient has loss of sensation to monofilament testing, absent pedal pulses, and callus formation over the metatarsal heads. They have no current ulceration. What is their risk category?",
            options: [
              { id: "df-d-o1a", text: "Low risk: annual foot review is sufficient", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Neuropathy plus absent pulses is high risk; annual review is inadequate and delays preventive care", feedback: "This patient has both neuropathy and vascular compromise. They are high risk." },
              { id: "df-d-o1b", text: "High risk: refer to multidisciplinary foot team, review every 1–3 months, provide enhanced foot care and specialist footwear assessment", isCorrect: true, nextNodeId: "df-d-n2", feedback: "Correct. Combined neuropathy and absent pulses with callus places the patient at high risk per NICE guidelines." },
            ],
          },
          {
            id: "df-d-n2",
            prompt: "During a home visit, a diabetic patient shows you a painless wound on the sole of their foot that they only noticed today. It appears to penetrate to deeper tissues. The foot is warm and swollen. What do you do?",
            options: [
              { id: "df-d-o2a", text: "Clean and dress the wound; arrange a routine podiatry appointment", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A deep diabetic foot wound with warmth and swelling suggests active diabetic foot emergency requiring urgent specialist assessment within 24 hours", feedback: "This is a diabetic foot emergency. Urgent referral is needed, not routine appointment." },
              { id: "df-d-o2b", text: "Apply a basic protective dressing, refer urgently to the multidisciplinary diabetic foot team (within 24 hours per NICE), advise non-weight-bearing, and document", isCorrect: true, feedback: "Correct. NICE recommends urgent referral within 24 hours for active diabetic foot problems." },
            ],
          },
        ],
      },
    },
    {
      id: "df-matching-1",
      type: "matching",
      title: "Diabetic Foot Findings & Risk Categories",
      description: "Match diabetic foot findings to the correct risk categories.",
      data: {
        pairs: [
          { left: { id: "df-m-l1", text: "Normal sensation, palpable pulses, no deformity" }, right: { id: "df-m-r1", text: "Low risk (annual review)" } },
          { left: { id: "df-m-l2", text: "Loss of sensation OR absent pulses (one risk factor)" }, right: { id: "df-m-r2", text: "Moderate risk (3–6 monthly review)" } },
          { left: { id: "df-m-l3", text: "Loss of sensation AND absent pulses, OR callus/deformity with risk factor" }, right: { id: "df-m-r3", text: "High risk (1–3 monthly review)" } },
          { left: { id: "df-m-l4", text: "Active ulceration, infection, Charcot foot, or gangrene" }, right: { id: "df-m-r4", text: "Active problem (urgent MDT referral within 24 hours)" } },
        ],
      },
    },
  ],
};

export const hypoManagementContent: ScenarioContent = {
  tasks: [
    {
      id: "hypo-ordering-1",
      type: "ordering",
      title: "Managing Hypoglycaemia (Conscious Patient)",
      description: "Arrange the steps for managing hypoglycaemia in a conscious, cooperative patient.",
      data: {
        correctOrder: [
          { id: "hypo-s1", text: "Recognise signs of hypoglycaemia: shakiness, sweating, pallor, confusion, hunger, or irritability" },
          { id: "hypo-s2", text: "Confirm with blood glucose reading (below 4 mmol/L)" },
          { id: "hypo-s3", text: "Give 15–20g fast-acting glucose: 150–200ml fruit juice, 4–5 glucose tablets, or 1.5–2 tubes of GlucoGel" },
          { id: "hypo-s4", text: "Recheck blood glucose after 10–15 minutes" },
          { id: "hypo-s5", text: "If BG still below 4 mmol/L, repeat fast-acting glucose (up to 3 treatments)" },
          { id: "hypo-s6", text: "Once BG above 4 mmol/L, give long-acting carbohydrate: sandwich, toast, cereal, or next meal if due" },
          { id: "hypo-s7", text: "Do not administer insulin until the hypo has fully resolved and patient has eaten" },
          { id: "hypo-s8", text: "Document: BG readings, treatment given, timing, and outcome; report to prescriber" },
        ],
        distractors: [
          { id: "hypo-d1", text: "Give chocolate as first-line treatment for hypoglycaemia", isDistractor: true, errorClassification: "MINOR", errorRationale: "Chocolate is high in fat which slows glucose absorption; fast-acting pure glucose sources are recommended first-line" },
        ],
      },
    },
    {
      id: "hypo-decision-1",
      type: "decision",
      title: "Severe Hypoglycaemia with Reduced Consciousness",
      description: "Manage a patient with severe hypoglycaemia and altered consciousness.",
      data: {
        startNodeId: "hypo-d-n1",
        nodes: [
          {
            id: "hypo-d-n1",
            prompt: "You find a diabetic patient semi-conscious on the floor. Their BG is 1.8 mmol/L. They cannot swallow safely. What do you do?",
            options: [
              { id: "hypo-d-o1a", text: "Try to give them fruit juice by mouth", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Giving oral fluids to a semi-conscious patient creates aspiration risk", feedback: "Never give oral glucose to a patient who cannot swallow safely. Risk of aspiration." },
              { id: "hypo-d-o1b", text: "Place in recovery position, call 999, administer glucagon IM if prescribed and available, apply GlucoGel to buccal mucosa only if safe to do so", isCorrect: true, nextNodeId: "hypo-d-n2", feedback: "Correct. Safety first. Glucagon IM if available, call 999, and maintain airway." },
              { id: "hypo-d-o1c", text: "Call the GP surgery for advice", isCorrect: false, errorClassification: "MAJOR", errorRationale: "This is an immediately life-threatening emergency requiring 999, not a GP call", feedback: "This is a medical emergency. Call 999 immediately." },
            ],
          },
          {
            id: "hypo-d-n2",
            prompt: "You administer glucagon 1mg IM. After 10 minutes the patient is more alert. BG is now 3.8 mmol/L. What next?",
            options: [
              { id: "hypo-d-o2a", text: "The glucagon has worked so cancel the ambulance and leave", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Glucagon effect is temporary and glycogen stores may be depleted; the patient needs ongoing monitoring and investigation into the cause", feedback: "Glucagon provides temporary glucose rise. The patient still needs ambulance assessment." },
              { id: "hypo-d-o2b", text: "Once able to swallow, give fast-acting glucose followed by long-acting carbohydrate. Do not cancel the ambulance. Stay with the patient and monitor BG. Document everything", isCorrect: true, feedback: "Correct. Glucagon effect is temporary. The patient needs ongoing monitoring, oral glucose once safe, and ambulance assessment." },
            ],
          },
        ],
      },
    },
  ],
};

export const syringeDriverMgmtContent: ScenarioContent = {
  tasks: [
    {
      id: "sdm-ordering-1",
      type: "ordering",
      title: "Monitoring & Site Care of Running Syringe Driver",
      description: "Arrange the steps for ongoing monitoring and site care of a running McKinley T34 syringe driver.",
      data: {
        correctOrder: [
          { id: "sdm-s1", text: "Check the pump is running: green light flashing, no alarms, display shows remaining time/volume" },
          { id: "sdm-s2", text: "Verify the syringe label matches the prescription: drug(s), dose(s), date, and patient name" },
          { id: "sdm-s3", text: "Check the syringe contents for precipitation, discolouration, or crystallisation" },
          { id: "sdm-s4", text: "Check the giving set line from syringe to cannula for kinks, disconnections, or leaks" },
          { id: "sdm-s5", text: "Inspect the subcutaneous cannula site for redness, swelling, hardness, or leakage" },
          { id: "sdm-s6", text: "Assess the patient's symptom control: pain, nausea, agitation, and secretions" },
          { id: "sdm-s7", text: "Record the pump reading and volume delivered on the monitoring chart" },
          { id: "sdm-s8", text: "Document findings and contact the palliative care team if symptoms are uncontrolled or site needs changing" },
        ],
        distractors: [
          { id: "sdm-d1", text: "Open the lockbox and adjust the rate if symptoms are uncontrolled", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Rate adjustments require prescriber authorisation; unauthorised changes risk medication errors" },
        ],
      },
    },
    {
      id: "sdm-decision-1",
      type: "decision",
      title: "Managing Breakthrough Symptoms & Dose Changes",
      description: "Manage breakthrough symptoms and dose changes for syringe driver patients.",
      data: {
        startNodeId: "sdm-d-n1",
        nodes: [
          {
            id: "sdm-d-n1",
            prompt: "A palliative patient with a running syringe driver containing morphine 30mg/24hrs is experiencing breakthrough pain rated 7/10. They have PRN morphine sulphate 5mg SC prescribed for breakthrough pain. What do you do?",
            options: [
              { id: "sdm-d-o1a", text: "Increase the syringe driver dose to morphine 40mg/24hrs", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Changing the syringe driver dose without prescriber authorisation is outside scope and risks over-sedation", feedback: "Do not adjust the syringe driver without prescriber authorisation. Use the prescribed PRN medication." },
              { id: "sdm-d-o1b", text: "Administer the prescribed PRN morphine 5mg SC for breakthrough pain, reassess in 30 minutes, and contact the palliative care team if frequent breakthroughs occur", isCorrect: true, nextNodeId: "sdm-d-n2", feedback: "Correct. Use prescribed PRN medication for breakthroughs and escalate if symptom control is inadequate." },
            ],
          },
          {
            id: "sdm-d-n2",
            prompt: "The patient has needed 4 breakthrough doses of morphine 5mg SC in the last 24 hours. What should you do?",
            options: [
              { id: "sdm-d-o2a", text: "Continue giving PRN doses as prescribed and review next week", isCorrect: false, errorClassification: "MINOR", errorRationale: "Frequent breakthrough doses suggest inadequate background pain control; the syringe driver dose may need increasing", feedback: "Frequent breakthroughs indicate the background dose may be inadequate. Contact the palliative care team." },
              { id: "sdm-d-o2b", text: "Contact the palliative care team to review background analgesia. Report total PRN usage (20mg/24hrs) to inform dose titration. Document all findings", isCorrect: true, feedback: "Correct. The total PRN usage should be added to the next 24-hour syringe driver dose as per palliative care guidance." },
            ],
          },
        ],
      },
    },
  ],
};

export const symptomAssessContent: ScenarioContent = {
  tasks: [
    {
      id: "sa-ordering-1",
      type: "ordering",
      title: "Conducting IPOS Assessment",
      description: "Arrange the steps for conducting an Integrated Palliative care Outcome Scale (IPOS) assessment.",
      data: {
        correctOrder: [
          { id: "sa-s1", text: "Introduce the IPOS tool and explain its purpose to the patient and family" },
          { id: "sa-s2", text: "Ask the patient to rate their physical symptoms over the last 3 days (pain, breathlessness, nausea, etc.)" },
          { id: "sa-s3", text: "Assess emotional and psychological concerns: anxiety, depression, feeling at peace" },
          { id: "sa-s4", text: "Explore practical concerns: finances, personal affairs, information needs" },
          { id: "sa-s5", text: "Ask about the patient's main concerns or problems not covered by the questionnaire" },
          { id: "sa-s6", text: "If patient cannot self-report, complete the staff/carer version using clinical observation" },
          { id: "sa-s7", text: "Score each item and calculate the total IPOS score" },
          { id: "sa-s8", text: "Compare with previous assessments to identify trends and new problems" },
          { id: "sa-s9", text: "Document findings, update the care plan, and communicate priorities to the MDT" },
        ],
        distractors: [
          { id: "sa-d1", text: "Complete the IPOS only when the patient reports new symptoms", isDistractor: true, errorClassification: "MINOR", errorRationale: "IPOS should be completed regularly to track symptom trajectories, not only reactively when new symptoms arise" },
        ],
      },
    },
    {
      id: "sa-decision-1",
      type: "decision",
      title: "Pain Assessment in Non-Verbal Patients (Abbey Pain Scale)",
      description: "Assess pain in patients who cannot self-report using the Abbey Pain Scale.",
      data: {
        startNodeId: "sa-d-n1",
        nodes: [
          {
            id: "sa-d-n1",
            prompt: "A palliative patient with advanced dementia is grimacing, guarding their abdomen, and crying out during personal care. They cannot verbally report pain. How do you assess their pain?",
            options: [
              { id: "sa-d-o1a", text: "Assume they are not in pain as they cannot tell you", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Non-verbal patients can still experience pain; behavioural cues must be assessed using validated tools", feedback: "Non-verbal patients can still experience pain. Use a validated behavioural pain assessment tool." },
              { id: "sa-d-o1b", text: "Use the Abbey Pain Scale: assess vocalisation, facial expression, body language, behavioural change, physiological change, and physical change. Score and determine pain severity", isCorrect: true, nextNodeId: "sa-d-n2", feedback: "Correct. The Abbey Pain Scale assesses six behavioural domains to estimate pain in non-verbal patients." },
              { id: "sa-d-o1c", text: "Ask the family to assess the pain using a numerical rating scale", isCorrect: false, errorClassification: "MINOR", errorRationale: "Numerical rating scales require the patient to self-report; a behavioural assessment tool is needed for non-verbal patients", feedback: "Family input is valuable but a validated behavioural tool should be used for assessment." },
            ],
          },
          {
            id: "sa-d-n2",
            prompt: "The Abbey Pain Scale score is 10 (moderate pain). The patient has PRN paracetamol and morphine prescribed. What do you do?",
            options: [
              { id: "sa-d-o2a", text: "Give paracetamol only and reassess tomorrow", isCorrect: false, errorClassification: "MINOR", errorRationale: "Moderate pain in a palliative patient may require stronger analgesia; the WHO pain ladder should guide management", feedback: "Consider whether paracetamol alone is sufficient for moderate pain. Discuss with the palliative care team." },
              { id: "sa-d-o2b", text: "Administer appropriate PRN analgesia based on the pain severity, reassess pain 30–60 minutes later using Abbey, document, and contact the palliative care team if pain persists", isCorrect: true, feedback: "Correct. Administer appropriate analgesia, reassess using the same tool, and escalate if uncontrolled." },
            ],
          },
        ],
      },
    },
    {
      id: "sa-matching-1",
      type: "matching",
      title: "Symptoms & Assessment Tools",
      description: "Match palliative symptoms to their validated assessment tools.",
      data: {
        pairs: [
          { left: { id: "sa-m-l1", text: "Pain in non-verbal/dementia patients" }, right: { id: "sa-m-r1", text: "Abbey Pain Scale" } },
          { left: { id: "sa-m-l2", text: "Overall palliative symptom burden" }, right: { id: "sa-m-r2", text: "IPOS (Integrated Palliative care Outcome Scale)" } },
          { left: { id: "sa-m-l3", text: "Breathlessness severity and impact" }, right: { id: "sa-m-r3", text: "Modified Borg Scale / MRC Dyspnoea Scale" } },
          { left: { id: "sa-m-l4", text: "Nausea and vomiting assessment" }, right: { id: "sa-m-r4", text: "ESAS (Edmonton Symptom Assessment Scale)" } },
        ],
      },
    },
  ],
};

export const anticipatoryContent: ScenarioContent = {
  tasks: [
    {
      id: "ap-ordering-1",
      type: "ordering",
      title: "Administering Anticipatory Medications",
      description: "Arrange the steps for administering anticipatory (just-in-case) medications in palliative care.",
      data: {
        correctOrder: [
          { id: "ap-s1", text: "Assess the patient's symptom: identify the specific symptom requiring treatment (pain, nausea, agitation, respiratory secretions)" },
          { id: "ap-s2", text: "Check the anticipatory prescription: verify drug, dose, route (usually SC), frequency, and maximum doses in 24 hours" },
          { id: "ap-s3", text: "Confirm patient identity; explain the medication and obtain consent from patient or person with authority" },
          { id: "ap-s4", text: "Check the medication stock in the patient's home: drug name, strength, expiry date, and batch number" },
          { id: "ap-s5", text: "Prepare the medication using clean technique; have second checker verify if available" },
          { id: "ap-s6", text: "Administer the subcutaneous injection at an appropriate site" },
          { id: "ap-s7", text: "Dispose of sharps safely; secure remaining medication stock" },
          { id: "ap-s8", text: "Document: drug, dose, route, site, time, indication, and patient response" },
          { id: "ap-s9", text: "Reassess symptom within 30–60 minutes; contact the palliative care team if not effective" },
        ],
        distractors: [
          { id: "ap-d1", text: "Administer the anticipatory medication prophylactically even if the patient has no symptoms", isDistractor: true, errorClassification: "MINOR", errorRationale: "Anticipatory medications are PRN (as needed); prophylactic administration without symptoms is inappropriate" },
        ],
      },
    },
    {
      id: "ap-decision-1",
      type: "decision",
      title: "Selecting Appropriate PRN Medication",
      description: "Select the appropriate anticipatory medication for palliative symptoms.",
      data: {
        startNodeId: "ap-d-n1",
        nodes: [
          {
            id: "ap-d-n1",
            prompt: "A dying patient is experiencing noisy, rattling respiratory secretions. Their anticipatory medications include morphine, midazolam, hyoscine butylbromide, and levomepromazine. Which medication is most appropriate?",
            options: [
              { id: "ap-d-o1a", text: "Morphine — to reduce the respiratory rate", isCorrect: false, errorClassification: "MINOR", errorRationale: "While morphine can help breathlessness, hyoscine butylbromide is the first-line treatment for respiratory secretions", feedback: "Morphine is for pain and breathlessness. Hyoscine butylbromide is the first choice for respiratory secretions." },
              { id: "ap-d-o1b", text: "Hyoscine butylbromide (Buscopan) SC — an anticholinergic that reduces secretion production", isCorrect: true, nextNodeId: "ap-d-n2", feedback: "Correct. Hyoscine butylbromide is first-line for managing respiratory secretions in dying patients." },
              { id: "ap-d-o1c", text: "Midazolam — to sedate the patient so they don't notice the secretions", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Sedation is not appropriate first-line management for secretions; treat the symptom directly", feedback: "Midazolam is for agitation/anxiety, not secretions. Treat the specific symptom." },
            ],
          },
          {
            id: "ap-d-n2",
            prompt: "The same patient is now also showing signs of terminal agitation: restlessness, picking at bedclothes, and distress. Which anticipatory medication is most appropriate?",
            options: [
              { id: "ap-d-o2a", text: "Midazolam SC — a benzodiazepine for agitation and anxiety", isCorrect: true, feedback: "Correct. Midazolam is first-line for terminal agitation in the last days of life." },
              { id: "ap-d-o2b", text: "Hyoscine butylbromide SC — to reduce agitation", isCorrect: false, errorClassification: "MINOR", errorRationale: "Hyoscine butylbromide is for secretions, not agitation; midazolam is the appropriate choice", feedback: "Hyoscine butylbromide is for secretions. Midazolam is the correct choice for agitation." },
            ],
          },
        ],
      },
    },
  ],
};

export const verificationDeathContent: ScenarioContent = {
  tasks: [
    {
      id: "vd-ordering-1",
      type: "ordering",
      title: "Verification of Expected Death",
      description: "Arrange the steps for verification of an expected death in the community.",
      data: {
        correctOrder: [
          { id: "vd-s1", text: "Confirm the death was expected and documented as part of an end-of-life care plan" },
          { id: "vd-s2", text: "Identify the patient using their identification wristband or documentation" },
          { id: "vd-s3", text: "Observe for absence of respiratory effort for a minimum of 1 minute" },
          { id: "vd-s4", text: "Palpate for absence of carotid pulse for a minimum of 1 minute" },
          { id: "vd-s5", text: "Auscultate for absence of heart sounds for a minimum of 1 minute" },
          { id: "vd-s6", text: "Check for absence of pupillary response to light (fixed, dilated pupils)" },
          { id: "vd-s7", text: "Check for absence of response to painful stimulus (trapezius squeeze)" },
          { id: "vd-s8", text: "Note the time of verification (not time of death unless witnessed)" },
          { id: "vd-s9", text: "Document findings on the verification of death form; notify the GP to issue the death certificate" },
          { id: "vd-s10", text: "Offer support to the family, provide practical information, and ensure the body is treated with dignity" },
        ],
        distractors: [
          { id: "vd-d1", text: "Listen for heart sounds for 10 seconds and then confirm death", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Heart sounds must be auscultated for a minimum of 1 minute to confirm death; 10 seconds is insufficient" },
        ],
      },
    },
    {
      id: "vd-decision-1",
      type: "decision",
      title: "Unexpected Findings During Verification",
      description: "Manage unexpected findings during verification of expected death.",
      data: {
        startNodeId: "vd-d-n1",
        nodes: [
          {
            id: "vd-d-n1",
            prompt: "You arrive to verify an expected death. The family report the patient was found on the floor with facial bruising. What do you do?",
            options: [
              { id: "vd-d-o1a", text: "Verify the death and document the bruising in the notes", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Unexplained injuries require consideration of whether the death should be treated as unexpected and reported to the coroner", feedback: "Unexplained injuries change the circumstances. Do not simply verify. Consider referral to the coroner." },
              { id: "vd-d-o1b", text: "Do not verify the death as expected. Contact the GP urgently, consider whether the coroner should be notified, document the circumstances and injuries, and preserve the scene", isCorrect: true, nextNodeId: "vd-d-n2", feedback: "Correct. Unexplained injuries mean the death may need to be referred to the coroner rather than verified as expected." },
            ],
          },
          {
            id: "vd-d-n2",
            prompt: "During verification of another expected death, you detect a very faint pulse. What do you do?",
            options: [
              { id: "vd-d-o2a", text: "The patient is on an end-of-life pathway so complete the verification", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A detectable pulse means the patient is alive; verifying death would be a catastrophic error", feedback: "A pulse means the patient is alive. You cannot verify death." },
              { id: "vd-d-o2b", text: "Do not verify death. Call 999, commence appropriate care, contact the GP, and stay with the patient until help arrives", isCorrect: true, feedback: "Correct. If any signs of life are present, death cannot be verified. Commence appropriate care immediately." },
            ],
          },
        ],
      },
    },
  ],
};

export const pegFeedingContent: ScenarioContent = {
  tasks: [
    {
      id: "peg-ordering-1",
      type: "ordering",
      title: "Administering PEG Feed",
      description: "Arrange the steps for administering an enteral feed via a PEG tube.",
      data: {
        correctOrder: [
          { id: "peg-s1", text: "Check prescription: feed type, volume, rate, and any additional water flushes" },
          { id: "peg-s2", text: "Confirm patient identity and explain the procedure" },
          { id: "peg-s3", text: "Position the patient upright at 30–45° to reduce aspiration risk" },
          { id: "peg-s4", text: "Perform hand hygiene and apply clean gloves" },
          { id: "peg-s5", text: "Check PEG site for signs of infection, leakage, or tube migration; measure external tube length" },
          { id: "peg-s6", text: "Check tube patency by aspirating and checking gastric pH (should be ≤5.5)" },
          { id: "peg-s7", text: "Flush the tube with 30ml water before commencing feed" },
          { id: "peg-s8", text: "Connect the giving set to the feed container and prime the line" },
          { id: "peg-s9", text: "Connect to the PEG tube and set the pump to the prescribed rate" },
          { id: "peg-s10", text: "Flush with 30ml water after feed completion" },
          { id: "peg-s11", text: "Keep patient upright for 30–60 minutes post-feed" },
          { id: "peg-s12", text: "Document: feed given, volume, rate, gastric pH, site condition, and patient tolerance" },
        ],
        distractors: [
          { id: "peg-d1", text: "Lay the patient flat during feeding to prevent discomfort", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Lying flat during enteral feeding significantly increases aspiration risk and is contraindicated" },
        ],
      },
    },
    {
      id: "peg-decision-1",
      type: "decision",
      title: "Managing Feed Complications",
      description: "Manage complications during PEG feeding including aspiration risk and blocked tube.",
      data: {
        startNodeId: "peg-d-n1",
        nodes: [
          {
            id: "peg-d-n1",
            prompt: "During a PEG feed, the patient begins coughing, looks distressed, and their SpO2 drops from 96% to 88%. What do you do?",
            options: [
              { id: "peg-d-o1a", text: "Slow the feed rate and continue monitoring", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Coughing with desaturation during a feed suggests aspiration; the feed must be stopped immediately", feedback: "Stop the feed immediately. These are signs of possible aspiration." },
              { id: "peg-d-o1b", text: "Stop the feed immediately, sit the patient upright, apply oxygen if prescribed, suction if needed and available, call for urgent medical review", isCorrect: true, nextNodeId: "peg-d-n2", feedback: "Correct. Suspected aspiration requires immediate feed cessation, positioning, and medical review." },
            ],
          },
          {
            id: "peg-d-n2",
            prompt: "On another visit, you cannot flush the PEG tube. Warm water does not clear it. What do you do?",
            options: [
              { id: "peg-d-o2a", text: "Use a thin wire to clear the blockage", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Using wire or sharp objects to unblock a PEG tube risks perforation of the tube or stomach wall", feedback: "Never use wire or sharp instruments. Risk of tube/gastric perforation." },
              { id: "peg-d-o2b", text: "Try gentle flushing with warm water using a push-pull technique with a 50ml syringe. If unsuccessful, consider pancreatic enzyme solution if local protocol allows, and contact the dietitian or gastroenterology team", isCorrect: true, feedback: "Correct. Use warm water with push-pull technique first. Escalate to specialist team if unable to clear." },
            ],
          },
        ],
      },
    },
    {
      id: "peg-calc-1",
      type: "calculation",
      title: "Feed Rate Calculation",
      description: "Calculate the enteral feed rate for a prescribed volume over a set time.",
      data: {
        question: "A patient is prescribed 1000ml of enteral feed to be administered over 10 hours via a PEG pump. Calculate the rate in ml per hour.",
        formula: "Rate (ml/hr) = Total volume (ml) ÷ Time (hours)",
        inputs: { "Total volume (ml)": 1000, "Time (hours)": 10 },
        correctAnswer: 100,
        tolerance: 1,
        unit: "ml/hr",
        errorClassification: "MAJOR",
        errorRationale: "Incorrect feed rate could lead to aspiration from too-fast delivery or inadequate nutrition from too-slow delivery",
      },
    },
  ],
};

export const nutritionalScreenContent: ScenarioContent = {
  tasks: [
    {
      id: "ns-ordering-1",
      type: "ordering",
      title: "Completing MUST Screening",
      description: "Arrange the steps for completing the Malnutrition Universal Screening Tool (MUST).",
      data: {
        correctOrder: [
          { id: "ns-s1", text: "Explain the purpose of nutritional screening to the patient" },
          { id: "ns-s2", text: "Measure the patient's height (or use ulna length/knee height if unable to stand)" },
          { id: "ns-s3", text: "Weigh the patient using calibrated scales; document weight" },
          { id: "ns-s4", text: "Calculate BMI: weight (kg) ÷ height (m)² — score Step 1 of MUST" },
          { id: "ns-s5", text: "Calculate percentage unplanned weight loss in the last 3–6 months — score Step 2 of MUST" },
          { id: "ns-s6", text: "Consider acute disease effect: if acutely ill and no nutritional intake for >5 days — score Step 3" },
          { id: "ns-s7", text: "Add scores from Steps 1, 2, and 3 to calculate overall risk: 0 = low, 1 = medium, ≥2 = high" },
          { id: "ns-s8", text: "Implement the appropriate care plan based on risk category" },
          { id: "ns-s9", text: "Document the MUST score, plan, and date for re-screening" },
        ],
        distractors: [
          { id: "ns-d1", text: "Estimate the patient's weight if scales are not available and proceed with scoring", isDistractor: true, errorClassification: "MINOR", errorRationale: "Estimated weights are inaccurate; alternative anthropometric measures (mid-upper arm circumference) should be used if weighing is not possible" },
        ],
      },
    },
    {
      id: "ns-decision-1",
      type: "decision",
      title: "Interpreting MUST Scores & Care Planning",
      description: "Interpret MUST scores and develop appropriate nutritional care plans.",
      data: {
        startNodeId: "ns-d-n1",
        nodes: [
          {
            id: "ns-d-n1",
            prompt: "A patient scores 2 on the MUST tool (BMI 17, with 8% weight loss in 3 months). What is the risk category and what action is required?",
            options: [
              { id: "ns-d-o1a", text: "Low risk: routine screening in 1 month", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A MUST score of 2 or above is high risk, requiring urgent nutritional intervention", feedback: "A score of 2 is high risk. This patient needs urgent nutritional support." },
              { id: "ns-d-o1b", text: "High risk: refer to dietitian, implement food fortification and oral nutritional supplements, set nutritional goals, and monitor closely", isCorrect: true, nextNodeId: "ns-d-n2", feedback: "Correct. MUST score ≥2 is high risk, requiring dietetic referral and nutritional intervention." },
            ],
          },
          {
            id: "ns-d-n2",
            prompt: "The patient is reluctant to take oral nutritional supplements and says they have no appetite. What approach do you take?",
            options: [
              { id: "ns-d-o2a", text: "Document refusal and discharge from nutritional monitoring", isCorrect: false, errorClassification: "MINOR", errorRationale: "Patient reluctance requires further exploration of underlying causes and alternative strategies, not discharge from monitoring", feedback: "Explore the reasons for poor appetite and discuss alternatives. Do not simply discharge from monitoring." },
              { id: "ns-d-o2b", text: "Explore reasons for poor appetite (medication side effects, depression, oral health), offer small frequent meals, food fortification advice, and re-refer to dietitian for alternative strategies", isCorrect: true, feedback: "Correct. Investigate underlying causes and work with the patient and dietitian on acceptable strategies." },
            ],
          },
        ],
      },
    },
    {
      id: "ns-calc-1",
      type: "calculation",
      title: "BMI Calculation",
      description: "Calculate a patient's Body Mass Index.",
      data: {
        question: "A patient weighs 52kg and is 1.65m tall. Calculate their BMI.",
        formula: "BMI = Weight (kg) ÷ Height (m)²",
        inputs: { "Weight (kg)": 52, "Height (m)": 1.65 },
        correctAnswer: 19.1,
        tolerance: 0.2,
        unit: "kg/m²",
        errorClassification: "MINOR",
        errorRationale: "Incorrect BMI calculation could lead to inaccurate MUST scoring and inappropriate nutritional care planning",
      },
    },
  ],
};

export const fluidBalanceContent: ScenarioContent = {
  tasks: [
    {
      id: "fb-ordering-1",
      type: "ordering",
      title: "Accurate Fluid Balance Recording",
      description: "Arrange the steps for accurate fluid balance monitoring in the community.",
      data: {
        correctOrder: [
          { id: "fb-s1", text: "Explain the importance of fluid balance monitoring to the patient and carers" },
          { id: "fb-s2", text: "Provide a fluid balance chart and educate on how to complete it" },
          { id: "fb-s3", text: "Agree a 24-hour monitoring period start time (e.g. midnight to midnight)" },
          { id: "fb-s4", text: "Record all fluid intake: oral fluids, IV fluids, enteral feeds, and medications given with water" },
          { id: "fb-s5", text: "Record all fluid output: urine (measured), vomit, diarrhoea, wound drainage, and stoma output" },
          { id: "fb-s6", text: "At the end of the monitoring period, calculate total intake and total output" },
          { id: "fb-s7", text: "Calculate fluid balance: Total intake minus total output" },
          { id: "fb-s8", text: "Interpret the result and report significant positive or negative balance to the clinician" },
          { id: "fb-s9", text: "Document findings, fluid balance total, and any actions taken" },
        ],
        distractors: [
          { id: "fb-d1", text: "Estimate urine output rather than measuring it to save time", isDistractor: true, errorClassification: "MINOR", errorRationale: "Estimated output is inaccurate and can mask dehydration or fluid overload" },
        ],
      },
    },
    {
      id: "fb-decision-1",
      type: "decision",
      title: "Identifying Dehydration & Fluid Overload",
      description: "Identify clinical signs of dehydration and fluid overload.",
      data: {
        startNodeId: "fb-d-n1",
        nodes: [
          {
            id: "fb-d-n1",
            prompt: "A patient's fluid balance chart shows intake of 800ml and output of 1800ml over 24 hours. They have dry mouth, reduced skin turgor, concentrated urine, and feel dizzy on standing. What do you assess?",
            options: [
              { id: "fb-d-o1a", text: "This is normal variation; continue monitoring", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A negative balance of 1000ml with clinical signs of dehydration requires intervention", feedback: "A significant negative fluid balance with dehydration signs requires action." },
              { id: "fb-d-o1b", text: "Clinical dehydration with negative fluid balance (-1000ml). Encourage oral fluids if safe to do so, review medications (diuretics), contact GP for review, and consider subcutaneous fluid replacement if oral intake is inadequate", isCorrect: true, nextNodeId: "fb-d-n2", feedback: "Correct. Clinical dehydration with significant negative balance requires intervention and medical review." },
            ],
          },
          {
            id: "fb-d-n2",
            prompt: "Another patient has bilateral ankle oedema, crackles on lung auscultation, breathlessness when lying flat, and a positive fluid balance of +1500ml. What do you suspect?",
            options: [
              { id: "fb-d-o2a", text: "Fluid overload. Contact GP urgently, elevate legs, review fluid intake and diuretic therapy, monitor closely, and document findings", isCorrect: true, feedback: "Correct. These are classic signs of fluid overload requiring urgent medical review." },
              { id: "fb-d-o2b", text: "Normal fluid retention; advise them to reduce salt intake", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Bilateral oedema with pulmonary crackles and orthopnoea indicates fluid overload, potentially cardiac failure, requiring urgent medical review", feedback: "These signs suggest significant fluid overload. Urgent medical review is needed." },
            ],
          },
        ],
      },
    },
    {
      id: "fb-calc-1",
      type: "calculation",
      title: "Total Fluid Balance Calculation",
      description: "Calculate the total fluid balance from intake and output data.",
      data: {
        question: "A patient's 24-hour fluid intake is: oral fluids 1200ml, IV fluids 500ml. Output is: urine 1500ml, vomit 200ml. Calculate the total fluid balance.",
        formula: "Fluid balance = Total intake - Total output",
        inputs: { "Oral fluids (ml)": 1200, "IV fluids (ml)": 500, "Urine (ml)": 1500, "Vomit (ml)": 200 },
        correctAnswer: 0,
        tolerance: 1,
        unit: "ml",
        errorClassification: "MINOR",
        errorRationale: "Incorrect fluid balance calculation can mask dehydration or fluid overload and delay appropriate clinical intervention",
      },
    },
  ],
};

export const dysphagiaContent: ScenarioContent = {
  tasks: [
    {
      id: "dys-ordering-1",
      type: "ordering",
      title: "Safe Feeding with Dysphagia",
      description: "Arrange the steps for safely feeding a patient with dysphagia.",
      data: {
        correctOrder: [
          { id: "dys-s1", text: "Check the SALT (Speech and Language Therapy) recommendations: prescribed IDDSI level for fluids and diet" },
          { id: "dys-s2", text: "Confirm patient identity and check they are alert and responsive enough to eat/drink safely" },
          { id: "dys-s3", text: "Position patient upright at 90° (or as specified by SALT)" },
          { id: "dys-s4", text: "Prepare food and fluids to the prescribed consistency; check texture visually and by fork/spoon test" },
          { id: "dys-s5", text: "Offer small amounts using appropriate utensils (teaspoon if specified)" },
          { id: "dys-s6", text: "Observe for signs of aspiration: coughing, wet/gurgly voice, choking, watery eyes" },
          { id: "dys-s7", text: "Allow adequate time between mouthfuls; ensure the patient has swallowed before offering more" },
          { id: "dys-s8", text: "Ensure oral hygiene after meals to reduce aspiration pneumonia risk" },
          { id: "dys-s9", text: "Keep patient upright for 30 minutes post-meal" },
          { id: "dys-s10", text: "Document: amount eaten/drunk, tolerance, any signs of aspiration, and IDDSI level provided" },
        ],
        distractors: [
          { id: "dys-d1", text: "Use a straw for thickened fluids to make drinking easier", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Straws increase the speed and volume of fluid delivered, increasing aspiration risk in dysphagia patients" },
        ],
      },
    },
    {
      id: "dys-decision-1",
      type: "decision",
      title: "Recognising Aspiration Signs & IDDSI Framework",
      description: "Recognise aspiration signs and apply the IDDSI framework.",
      data: {
        startNodeId: "dys-d-n1",
        nodes: [
          {
            id: "dys-d-n1",
            prompt: "During a meal, a patient on IDDSI Level 4 (pureed) diet develops a wet, gurgly voice and begins coughing after swallowing. What do you do?",
            options: [
              { id: "dys-d-o1a", text: "Encourage them to drink water to clear their throat", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Giving thin fluids to a patient showing aspiration signs will worsen the aspiration; water is likely thinner than their prescribed fluid level", feedback: "Do not give thin fluids. This patient is showing signs of aspiration." },
              { id: "dys-d-o1b", text: "Stop feeding immediately, sit the patient upright, allow them to cough, suction if trained and equipped, monitor SpO2, and refer urgently back to SALT", isCorrect: true, nextNodeId: "dys-d-n2", feedback: "Correct. Stop feeding, maintain airway, and urgently re-refer to SALT for swallow reassessment." },
            ],
          },
          {
            id: "dys-d-n2",
            prompt: "A carer asks you why the patient can't just have normal food — the puree looks unappetising. How do you respond?",
            options: [
              { id: "dys-d-o2a", text: "Agree to trial normal food as the patient seems to be managing well today", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Altering prescribed IDDSI levels without SALT assessment risks aspiration pneumonia, which is life-threatening", feedback: "Never alter prescribed IDDSI levels without SALT reassessment. Aspiration can be silent." },
              { id: "dys-d-o2b", text: "Explain the aspiration risk, discuss ways to make pureed food more appetising (moulds, garnish, flavour), and arrange SALT review if a diet upgrade is being considered", isCorrect: true, feedback: "Correct. Explain the risks, work on presentation, and involve SALT for any diet changes." },
            ],
          },
        ],
      },
    },
    {
      id: "dys-matching-1",
      type: "matching",
      title: "IDDSI Levels & Consistencies",
      description: "Match IDDSI levels to the correct fluid and food consistencies.",
      data: {
        pairs: [
          { left: { id: "dys-m-l1", text: "IDDSI Level 0" }, right: { id: "dys-m-r1", text: "Thin fluids (water, tea, juice)" } },
          { left: { id: "dys-m-l2", text: "IDDSI Level 1" }, right: { id: "dys-m-r2", text: "Slightly thick (thicker than water, flows through a straw)" } },
          { left: { id: "dys-m-l3", text: "IDDSI Level 4" }, right: { id: "dys-m-r3", text: "Pureed (smooth, no lumps, cannot be poured off a fork)" } },
          { left: { id: "dys-m-l4", text: "IDDSI Level 7" }, right: { id: "dys-m-r4", text: "Regular/Easy to chew (normal everyday foods)" } },
        ],
      },
    },
  ],
};

export const news2Content: ScenarioContent = {
  tasks: [
    {
      id: "n2-ordering-1",
      type: "ordering",
      title: "Conducting NEWS2 Observations",
      description: "Arrange the steps for conducting a full set of NEWS2 observations.",
      data: {
        correctOrder: [
          { id: "n2-s1", text: "Explain the observations to the patient and ensure they are comfortable" },
          { id: "n2-s2", text: "Measure respiratory rate for a full 60 seconds (count chest rises)" },
          { id: "n2-s3", text: "Measure SpO2 using pulse oximeter; note if patient is on oxygen or air (Scale 1 or Scale 2)" },
          { id: "n2-s4", text: "Record whether patient is on supplemental oxygen or breathing room air" },
          { id: "n2-s5", text: "Measure temperature using appropriate method" },
          { id: "n2-s6", text: "Measure systolic blood pressure using calibrated sphygmomanometer" },
          { id: "n2-s7", text: "Measure heart rate (radial pulse for 60 seconds or from BP machine)" },
          { id: "n2-s8", text: "Assess level of consciousness using ACVPU scale (Alert, Confusion, Voice, Pain, Unresponsive)" },
          { id: "n2-s9", text: "Score each parameter using the NEWS2 chart and calculate the aggregate score" },
          { id: "n2-s10", text: "Determine clinical response based on aggregate score and any individual parameter scoring 3" },
        ],
        distractors: [
          { id: "n2-d1", text: "Count the respiratory rate for 15 seconds and multiply by 4", isDistractor: true, errorClassification: "MINOR", errorRationale: "Respiratory rate should be counted for a full 60 seconds for accuracy; short counts miss irregular breathing patterns" },
        ],
      },
    },
    {
      id: "n2-decision-1",
      type: "decision",
      title: "Clinical Escalation Based on NEWS2",
      description: "Determine appropriate clinical escalation based on NEWS2 scores.",
      data: {
        startNodeId: "n2-d-n1",
        nodes: [
          {
            id: "n2-d-n1",
            prompt: "A patient's NEWS2 aggregate score is 7. Their individual parameters: RR 24 (score 2), SpO2 93% on air (score 2), BP 100 systolic (score 1), HR 110 (score 2), Temp 38.5 (score 0), ACVPU Alert (score 0). What is the appropriate response?",
            options: [
              { id: "n2-d-o1a", text: "Score 7 is medium risk; increase observation frequency to 4-hourly", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A NEWS2 score of 7 or above triggers an urgent/emergency response, not simply increased observation", feedback: "A score of 7+ is an emergency threshold. Urgent clinical review is required." },
              { id: "n2-d-o1b", text: "Score 7 triggers urgent/emergency response. Escalate immediately: call GP/999, increase monitoring to continuous if possible, prepare SBAR handover, and commence any prescribed interventions", isCorrect: true, nextNodeId: "n2-d-n2", feedback: "Correct. NEWS2 score ≥7 requires urgent/emergency response with immediate clinical review." },
            ],
          },
          {
            id: "n2-d-n2",
            prompt: "Another patient scores 4 on NEWS2 aggregate but one parameter (respiratory rate = 25) scores 3 individually. What is the appropriate response?",
            options: [
              { id: "n2-d-o2a", text: "Aggregate score 4 is low-medium risk; monitor more frequently", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Any individual parameter scoring 3 triggers an urgent response regardless of the aggregate score", feedback: "A single parameter scoring 3 is a red flag requiring urgent clinical review." },
              { id: "n2-d-o2b", text: "Any individual parameter scoring 3 triggers urgent clinical review regardless of aggregate score. Escalate immediately to GP or emergency services", isCorrect: true, feedback: "Correct. A single parameter scoring 3 requires urgent clinical review, irrespective of aggregate score." },
            ],
          },
        ],
      },
    },
    {
      id: "n2-calc-1",
      type: "calculation",
      title: "NEWS2 Score Calculation",
      description: "Calculate the NEWS2 aggregate score from observations.",
      data: {
        question: "A patient has: RR 22 (score 2), SpO2 94% on air Scale 1 (score 1), Systolic BP 105 (score 1), HR 95 (score 1), Temp 38.2 (score 1), ACVPU = Alert (score 0), on room air (score 0). Calculate the aggregate NEWS2 score.",
        formula: "NEWS2 aggregate = sum of all individual parameter scores",
        inputs: { "RR score": 2, "SpO2 score": 1, "Air/O2 score": 0, "BP score": 1, "HR score": 1, "Temp score": 1, "ACVPU score": 0 },
        correctAnswer: 6,
        tolerance: 0,
        unit: "points",
        errorClassification: "MAJOR",
        errorRationale: "Incorrect NEWS2 calculation can lead to failure to escalate a deteriorating patient or unnecessary emergency response",
      },
    },
  ],
};

export const fallsRiskContent: ScenarioContent = {
  tasks: [
    {
      id: "fr-ordering-1",
      type: "ordering",
      title: "Falls Risk Assessment in Home Setting",
      description: "Arrange the steps for conducting a falls risk assessment in a patient's home.",
      data: {
        correctOrder: [
          { id: "fr-s1", text: "Ask about falls history: frequency, circumstances, injuries, and near-misses in the last 12 months" },
          { id: "fr-s2", text: "Assess gait and balance: observe walking, turning, sit-to-stand (Timed Up and Go test if appropriate)" },
          { id: "fr-s3", text: "Review medications for fall-risk drugs: sedatives, antihypertensives, diuretics, opioids" },
          { id: "fr-s4", text: "Check postural blood pressure: lying and standing BP (lying for 5 minutes, then immediately on standing and at 3 minutes)" },
          { id: "fr-s5", text: "Assess vision and hearing; check when last assessed" },
          { id: "fr-s6", text: "Assess footwear for appropriateness (well-fitting, non-slip, supportive)" },
          { id: "fr-s7", text: "Conduct home environment assessment: lighting, rugs, clutter, handrails, bathroom safety" },
          { id: "fr-s8", text: "Assess continence: urgency and nocturia increase fall risk" },
          { id: "fr-s9", text: "Develop a multifactorial falls prevention plan and refer to falls prevention service if indicated" },
          { id: "fr-s10", text: "Document: risk factors identified, interventions planned, and referrals made" },
        ],
        distractors: [
          { id: "fr-d1", text: "Advise the patient to stay in bed to prevent future falls", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Bed rest leads to deconditioning, increased frailty, and paradoxically higher fall risk; mobility should be maintained with appropriate support" },
        ],
      },
    },
    {
      id: "fr-decision-1",
      type: "decision",
      title: "Post-Fall Assessment & Management",
      description: "Assess and manage a patient after a fall in the community.",
      data: {
        startNodeId: "fr-d-n1",
        nodes: [
          {
            id: "fr-d-n1",
            prompt: "You arrive at a patient's home and they are on the floor, having fallen 20 minutes ago. They are conscious and alert but complaining of hip pain and unable to weight-bear. What do you do?",
            options: [
              { id: "fr-d-o1a", text: "Help them up onto a chair and assess from there", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Moving a patient with suspected hip fracture before assessment risks worsening a fracture or causing neurovascular damage", feedback: "Do not move the patient until you have assessed for fracture. Hip pain with inability to weight-bear suggests fracture." },
              { id: "fr-d-o1b", text: "Keep the patient still, do not attempt to move them, call 999, keep them warm and comfortable, perform basic observations, and assess for head injury", isCorrect: true, nextNodeId: "fr-d-n2", feedback: "Correct. Suspected hip fracture requires immobilisation and emergency transfer to hospital." },
            ],
          },
          {
            id: "fr-d-n2",
            prompt: "On another visit, a patient reports falling twice this week but sustained no injury. They are mobile and independent. What is your approach?",
            options: [
              { id: "fr-d-o2a", text: "Document the falls and advise them to be more careful", isCorrect: false, errorClassification: "MINOR", errorRationale: "Recurrent falls require a multifactorial falls risk assessment, not just advice to be careful", feedback: "Recurrent falls need a proper assessment to identify modifiable risk factors." },
              { id: "fr-d-o2b", text: "Conduct a comprehensive multifactorial falls risk assessment, check postural BP, review medications, assess home environment, refer to falls prevention service, and document", isCorrect: true, feedback: "Correct. Recurrent falls require a thorough multifactorial assessment and referral to falls prevention services." },
            ],
          },
        ],
      },
    },
  ],
};

export const mentalCapacityContent: ScenarioContent = {
  tasks: [
    {
      id: "mca-ordering-1",
      type: "ordering",
      title: "Conducting a Mental Capacity Assessment (MCA 2005)",
      description: "Arrange the steps for conducting a mental capacity assessment under the Mental Capacity Act 2005.",
      data: {
        correctOrder: [
          { id: "mca-s1", text: "Identify the specific decision to be made — capacity is decision-specific and time-specific" },
          { id: "mca-s2", text: "Apply the diagnostic test: does the person have an impairment or disturbance of the mind or brain?" },
          { id: "mca-s3", text: "Apply the functional test (all four elements): can the person understand the relevant information?" },
          { id: "mca-s4", text: "Can the person retain the information long enough to make the decision?" },
          { id: "mca-s5", text: "Can the person use or weigh the information to make a decision?" },
          { id: "mca-s6", text: "Can the person communicate their decision (by any means)?" },
          { id: "mca-s7", text: "If the person fails any one element of the functional test, they lack capacity for that decision" },
          { id: "mca-s8", text: "Document: the decision assessed, steps taken to support the person, findings for each element, and conclusion" },
          { id: "mca-s9", text: "If they lack capacity, proceed to best interests decision-making involving relevant parties" },
        ],
        distractors: [
          { id: "mca-d1", text: "Conclude the patient lacks capacity because they have a diagnosis of dementia", isDistractor: true, errorClassification: "MAJOR", errorRationale: "A diagnosis alone does not determine capacity; the functional test must be applied for each specific decision (MCA Section 2)" },
        ],
      },
    },
    {
      id: "mca-decision-1",
      type: "decision",
      title: "Best Interests Decision-Making",
      description: "Navigate best interests decision-making scenarios under the MCA.",
      data: {
        startNodeId: "mca-d-n1",
        nodes: [
          {
            id: "mca-d-n1",
            prompt: "A patient with advanced dementia is assessed as lacking capacity to decide about having a catheter inserted. They become distressed and resistant during the procedure. No advance decision or LPA exists. What do you do?",
            options: [
              { id: "mca-d-o1a", text: "Continue with the procedure as it is in their best interests medically", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Even in best interests, the least restrictive option must be considered and the person's wishes, feelings, and resistance must be taken into account", feedback: "Consider the least restrictive option. Their distress must be factored into best interests." },
              { id: "mca-d-o1b", text: "Stop the procedure, review whether it is urgently needed, consult with family and MDT, consider the least restrictive option, and document the best interests decision-making process", isCorrect: true, nextNodeId: "mca-d-n2", feedback: "Correct. Best interests must weigh the person's wishes and feelings, including expressed distress, and consider less restrictive alternatives." },
            ],
          },
          {
            id: "mca-d-n2",
            prompt: "A patient who has capacity refuses a life-saving treatment that you believe they clearly need. What is the legal position?",
            options: [
              { id: "mca-d-o2a", text: "Override their decision as it is clearly not in their best interests", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A person with capacity has the absolute right to refuse treatment under MCA Section 1(4), even if it is life-threatening", feedback: "A capacitous adult has the right to refuse any treatment, even if it will result in death." },
              { id: "mca-d-o2b", text: "Respect their decision. Ensure they have been given all relevant information, confirm they understand the consequences, document thoroughly, and inform the clinical team", isCorrect: true, feedback: "Correct. MCA Principle 3: a person is not to be treated as lacking capacity merely because they make an unwise decision." },
            ],
          },
        ],
      },
    },
  ],
};

export const safeguardingContent: ScenarioContent = {
  tasks: [
    {
      id: "sg-ordering-1",
      type: "ordering",
      title: "Making a Safeguarding Referral",
      description: "Arrange the steps for making a safeguarding adults referral.",
      data: {
        correctOrder: [
          { id: "sg-s1", text: "Recognise the concern: identify indicators of abuse or neglect" },
          { id: "sg-s2", text: "Ensure immediate safety of the individual at risk" },
          { id: "sg-s3", text: "Preserve any evidence if safe to do so (do not interfere with a potential crime scene)" },
          { id: "sg-s4", text: "Listen to the person and record what they tell you using their own words" },
          { id: "sg-s5", text: "Do not investigate or question the alleged perpetrator" },
          { id: "sg-s6", text: "Discuss with your line manager or safeguarding lead (unless they are the subject of concern)" },
          { id: "sg-s7", text: "Make a referral to the local authority safeguarding team using the prescribed referral form" },
          { id: "sg-s8", text: "If there is immediate risk to life, call 999" },
          { id: "sg-s9", text: "Document factually: what you saw, heard, and were told; actions taken; who you referred to and when" },
        ],
        distractors: [
          { id: "sg-d1", text: "Inform the person you suspect of perpetrating the abuse before making the referral", isDistractor: true, errorClassification: "MAJOR", errorRationale: "Alerting the alleged perpetrator may put the victim at further risk and compromise any investigation" },
        ],
      },
    },
    {
      id: "sg-decision-1",
      type: "decision",
      title: "Recognising Types of Abuse & Responding",
      description: "Recognise different types of abuse and determine appropriate responses.",
      data: {
        startNodeId: "sg-d-n1",
        nodes: [
          {
            id: "sg-d-n1",
            prompt: "During a home visit, you notice an elderly patient has unexplained bruising on both upper arms in a grip pattern. They seem anxious when their carer enters the room. What do you do?",
            options: [
              { id: "sg-d-o1a", text: "Ask the patient about the bruising in front of the carer", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Asking about potential abuse in front of the suspected perpetrator may put the patient at further risk", feedback: "Never discuss concerns about abuse in front of the suspected perpetrator." },
              { id: "sg-d-o1b", text: "Find an opportunity to speak to the patient alone, ask open questions, document observations factually, and make a safeguarding referral following your organisation's policy", isCorrect: true, nextNodeId: "sg-d-n2", feedback: "Correct. Speak to the patient privately, use open questions, document factually, and follow safeguarding procedures." },
              { id: "sg-d-o1c", text: "Document the bruising and monitor at the next visit", isCorrect: false, errorClassification: "MAJOR", errorRationale: "Delaying action when there are indicators of physical abuse puts the patient at continued risk", feedback: "Safeguarding concerns must be acted upon promptly. Monitoring alone is not sufficient." },
            ],
          },
          {
            id: "sg-d-n2",
            prompt: "The patient discloses that their carer has been rough with them but begs you not to tell anyone. They say they are afraid of being put in a care home. What do you do?",
            options: [
              { id: "sg-d-o2a", text: "Respect their wishes and keep it confidential", isCorrect: false, errorClassification: "MAJOR", errorRationale: "While the patient's wishes should be considered, confidentiality can be overridden when there is a safeguarding concern; the duty to protect overrides the duty of confidentiality", feedback: "You have a duty to report safeguarding concerns even if the patient asks you not to." },
              { id: "sg-d-o2b", text: "Explain that you have a duty to share this information to keep them safe, reassure them about the process, acknowledge their fears, and make the safeguarding referral. Document the disclosure and your actions", isCorrect: true, feedback: "Correct. Explain your duty of care, reassure them, and follow safeguarding procedures. Their wishes should be considered but do not override the duty to protect." },
            ],
          },
        ],
      },
    },
  ],
};

export const stomaAssessContent: ScenarioContent = {
  tasks: [
    {
      id: "stm-ordering-1",
      type: "ordering",
      title: "Stoma Appliance Change",
      description: "Arrange the steps for performing a stoma appliance change.",
      data: {
        correctOrder: [
          { id: "stm-s1", text: "Explain procedure to the patient; encourage self-care participation where possible" },
          { id: "stm-s2", text: "Gather equipment: new appliance (correct size/type), template, scissors, wipes, disposal bag" },
          { id: "stm-s3", text: "Perform hand hygiene and apply gloves and apron" },
          { id: "stm-s4", text: "Gently remove the old appliance from top to bottom, supporting the skin" },
          { id: "stm-s5", text: "Assess the stoma: colour (should be red/pink), size, shape, and output" },
          { id: "stm-s6", text: "Assess the peristomal skin: check for soreness, excoriation, rash, or allergic reaction" },
          { id: "stm-s7", text: "Clean the stoma and peristomal skin with warm water; avoid soap; pat dry" },
          { id: "stm-s8", text: "Measure the stoma if needed and cut the new appliance to fit (1–2mm larger than stoma)" },
          { id: "stm-s9", text: "Apply barrier products to peristomal skin if needed (paste, seals, or powder)" },
          { id: "stm-s10", text: "Apply the new appliance from bottom to top, pressing firmly to achieve a seal" },
          { id: "stm-s11", text: "Dispose of old appliance in clinical waste; clean equipment" },
          { id: "stm-s12", text: "Document: stoma appearance, output, skin condition, and appliance used" },
        ],
        distractors: [
          { id: "stm-d1", text: "Clean the stoma with antiseptic solution to prevent infection", isDistractor: true, errorClassification: "MINOR", errorRationale: "Antiseptics can damage the stoma mucosa; warm water alone is recommended for cleaning" },
        ],
      },
    },
    {
      id: "stm-decision-1",
      type: "decision",
      title: "Managing Stoma Complications",
      description: "Manage common stoma complications in the community.",
      data: {
        startNodeId: "stm-d-n1",
        nodes: [
          {
            id: "stm-d-n1",
            prompt: "During an appliance change, you notice the stoma has changed from red/pink to a dusky purple/blue colour. What does this indicate and what do you do?",
            options: [
              { id: "stm-d-o1a", text: "Normal colour variation; apply the new appliance and document", isCorrect: false, errorClassification: "MAJOR", errorRationale: "A dusky or blue stoma indicates compromised blood supply (ischaemia) and requires urgent medical review", feedback: "A colour change from pink to purple/blue suggests ischaemia. This is urgent." },
              { id: "stm-d-o1b", text: "Suspect stoma ischaemia. Do not apply tight appliance, document the colour change with photos if consented, contact the stoma care nurse or surgical team urgently", isCorrect: true, nextNodeId: "stm-d-n2", feedback: "Correct. A dusky/blue stoma suggests compromised blood supply and requires urgent specialist review." },
            ],
          },
          {
            id: "stm-d-n2",
            prompt: "A patient with a colostomy has severe peristomal excoriation causing pain and frequent appliance leakage. What is your management?",
            options: [
              { id: "stm-d-o2a", text: "Change the appliance more frequently to keep the skin clean", isCorrect: false, errorClassification: "MINOR", errorRationale: "Frequent changes can worsen skin damage from adhesive removal; the underlying cause needs addressing", feedback: "Frequent changes may worsen skin damage. Address the underlying cause." },
              { id: "stm-d-o2b", text: "Assess the cause (poor fit, allergy, output type), use barrier products to protect the skin, ensure correct appliance sizing, and refer to stoma care nurse for specialist review", isCorrect: true, feedback: "Correct. Identify the cause of excoriation, use barrier products, ensure correct fit, and refer to specialist." },
            ],
          },
        ],
      },
    },
    {
      id: "stm-matching-1",
      type: "matching",
      title: "Stoma Types & Care Considerations",
      description: "Match stoma types to their specific care considerations.",
      data: {
        pairs: [
          { left: { id: "stm-m-l1", text: "Colostomy" }, right: { id: "stm-m-r1", text: "Formed stool, one-piece or two-piece drainable/closed bag, may be suitable for irrigation" } },
          { left: { id: "stm-m-l2", text: "Ileostomy" }, right: { id: "stm-m-r2", text: "Liquid/semi-formed output, drainable bag essential, higher risk of skin excoriation and dehydration" } },
          { left: { id: "stm-m-l3", text: "Urostomy (ileal conduit)" }, right: { id: "stm-m-r3", text: "Continuous urine output, drainage bag with tap, risk of UTI, alkaline encrustation" } },
        ],
      },
    },
  ],
};

export const stomaComplicationContent: ScenarioContent = {
  tasks: [
    {
      id: "stc-ordering-1",
      type: "ordering",
      title: "Assessing Stoma Viability",
      description: "Arrange the steps for assessing stoma viability and health.",
      data: {
        correctOrder: [
          { id: "stc-s1", text: "Remove the stoma appliance carefully and expose the stoma" },
          { id: "stc-s2", text: "Observe the stoma colour: healthy stoma is red/pink, moist, and shiny" },
          { id: "stc-s3", text: "Check stoma for signs of ischaemia: pale, dusky, dark, or black discolouration" },
          { id: "stc-s4", text: "Assess stoma size and height: check for retraction (sinking below skin level)" },
          { id: "stc-s5", text: "Assess for prolapse: stoma protruding excessively beyond normal" },
          { id: "stc-s6", text: "Check for parastomal hernia: bulging around the stoma site" },
          { id: "stc-s7", text: "Assess mucocutaneous junction for separation (mucocutaneous separation)" },
          { id: "stc-s8", text: "Document all findings with measurements and photographs if consented" },
          { id: "stc-s9", text: "Refer to stoma care nurse or surgical team for any abnormalities" },
        ],
        distractors: [
          { id: "stc-d1", text: "Push a prolapsed stoma back in using firm pressure", isDistractor: true, errorClassification: "MAJOR", errorRationale: "A prolapsed stoma should be managed by a specialist; forceful reduction risks mucosal damage and ischaemia" },
        ],
      },
    },
    {
      id: "stc-decision-1",
      type: "decision",
      title: "Identifying & Managing Stoma Complications",
      description: "Identify and manage common stoma complications.",
      data: {
        startNodeId: "stc-d-n1",
        nodes: [
          {
            id: "stc-d-n1",
            prompt: "A patient with a new ileostomy reports their output has been very high (over 1500ml in the last 24 hours). They feel thirsty, dizzy, and have dry mucous membranes. What do you do?",
            options: [
              { id: "stc-d-o1a", text: "Advise them to drink more water and review next week", isCorrect: false, errorClassification: "MAJOR", errorRationale: "High-output stoma with dehydration signs is a medical emergency; plain water alone does not replace electrolytes lost from ileostomy output", feedback: "High-output ileostomy with dehydration requires urgent medical review and electrolyte replacement." },
              { id: "stc-d-o1b", text: "Recognise high-output stoma with dehydration. Advise oral rehydration solution (not plain water alone), contact GP urgently for review and blood tests, and consider whether hospital admission is needed", isCorrect: true, nextNodeId: "stc-d-n2", feedback: "Correct. High-output stoma with dehydration signs requires urgent medical review and oral rehydration solution." },
            ],
          },
          {
            id: "stc-d-n2",
            prompt: "A patient with a colostomy has not had any output for 4 days. They report colicky abdominal pain and distension. What do you suspect and what do you do?",
            options: [
              { id: "stc-d-o2a", text: "Constipation; advise laxatives and dietary fibre", isCorrect: false, errorClassification: "MINOR", errorRationale: "While constipation is possible, colicky pain with distension and absent output may indicate obstruction requiring urgent assessment", feedback: "Consider bowel obstruction as well as constipation. Urgent medical assessment is needed." },
              { id: "stc-d-o2b", text: "Suspect possible bowel obstruction. Advise nil by mouth, contact GP urgently or call 999 if in acute distress, and arrange urgent surgical assessment", isCorrect: true, feedback: "Correct. Absent output with colicky pain and distension suggests possible obstruction requiring urgent assessment." },
            ],
          },
        ],
      },
    },
  ],
};

export const stomaEducationContent: ScenarioContent = {
  tasks: [
    {
      id: "ste-ordering-1",
      type: "ordering",
      title: "Stoma Patient Education Session",
      description: "Arrange the steps for a patient education session on stoma self-care.",
      data: {
        correctOrder: [
          { id: "ste-s1", text: "Assess the patient's current knowledge, readiness to learn, and any barriers (physical, emotional, cognitive)" },
          { id: "ste-s2", text: "Explain the anatomy of their stoma and what to expect in terms of normal output" },
          { id: "ste-s3", text: "Demonstrate the appliance change procedure step by step" },
          { id: "ste-s4", text: "Guide the patient through a supervised appliance change (hands-on practice)" },
          { id: "ste-s5", text: "Teach recognition of normal vs abnormal stoma appearance (colour, size, output)" },
          { id: "ste-s6", text: "Discuss diet and fluid advice specific to their stoma type" },
          { id: "ste-s7", text: "Explain how to order supplies and manage stock" },
          { id: "ste-s8", text: "Discuss when to seek help: signs of complications, dehydration, blockage, or skin problems" },
          { id: "ste-s9", text: "Provide written information and stoma care nurse contact details" },
          { id: "ste-s10", text: "Document education given, patient's level of competence, and follow-up plan" },
        ],
        distractors: [
          { id: "ste-d1", text: "Complete all education in a single session regardless of the patient's emotional state", isDistractor: true, errorClassification: "MINOR", errorRationale: "Education should be paced according to the patient's readiness; overwhelming them reduces learning and can cause psychological distress" },
        ],
      },
    },
    {
      id: "ste-decision-1",
      type: "decision",
      title: "Addressing Patient Concerns & Psychological Support",
      description: "Address patient concerns and provide psychological support for stoma patients.",
      data: {
        startNodeId: "ste-d-n1",
        nodes: [
          {
            id: "ste-d-n1",
            prompt: "A patient with a new stoma is tearful and says they feel disgusted by their body. They refuse to look at their stoma. How do you respond?",
            options: [
              { id: "ste-d-o1a", text: "Tell them they will get used to it and they need to learn to manage it themselves", isCorrect: false, errorClassification: "MINOR", errorRationale: "Dismissing emotional distress and pressuring the patient is not therapeutic and may worsen psychological adjustment", feedback: "Acknowledge their feelings first. Psychological adjustment to a stoma takes time." },
              { id: "ste-d-o1b", text: "Acknowledge their feelings, normalise their response, offer to proceed at their pace, provide information about stoma support groups and counselling services, and document the conversation", isCorrect: true, nextNodeId: "ste-d-n2", feedback: "Correct. Emotional adjustment is a key part of stoma care. Acknowledge, normalise, and offer support." },
            ],
          },
          {
            id: "ste-d-n2",
            prompt: "The patient asks if they will ever be able to have a normal relationship again. They are worried about intimacy. What is your response?",
            options: [
              { id: "ste-d-o2a", text: "Avoid the topic as it is too personal and refer them to the GP", isCorrect: false, errorClassification: "MINOR", errorRationale: "Intimacy concerns are a core part of stoma adjustment; avoiding the topic leaves the patient unsupported", feedback: "Intimacy is a valid concern. Address it sensitively rather than avoiding it." },
              { id: "ste-d-o2b", text: "Acknowledge the concern is normal and common. Provide reassurance that intimacy is possible, offer practical advice, provide information about specialist stoma counselling and support organisations, and document", isCorrect: true, feedback: "Correct. Intimacy concerns are common and valid. Provide reassurance, practical advice, and specialist support information." },
            ],
          },
        ],
      },
    },
  ],
};
