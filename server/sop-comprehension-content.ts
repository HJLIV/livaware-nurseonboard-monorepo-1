// SOP comprehension MCQs (task 114 follow-up).
//
// One short scenario per SOP — each scenario is *deliberately just
// outside* the documented procedure so the candidate has to apply the
// principle, not pattern-match a step. Single-best-answer MCQ format
// for speed of completion and easy reporting.
//
// Question definitions live in code (not the database) so editing /
// versioning a question is a code change reviewed via git. The
// per-attempt rows in `sop_comprehension_attempts` carry the snapshot
// `questionVersion` so a later edit to wording or options doesn't
// retroactively re-grade an old attempt.
//
// Slugs match the induction handbook SOP slugs from
// server/induction-content.ts so we can deep-link from a failed
// question back to the relevant SOP section.

export interface SopComprehensionOption {
  id: string;          // stable per-question (a/b/c/d)
  label: string;
  isCorrect: boolean;
  // Why-this-is-(in)correct copy shown after the candidate answers, so
  // the question doubles as a teaching moment.
  explanation: string;
}

export interface SopComprehensionQuestion {
  sopSlug: string;     // e.g. "induction:sop-01-antt"
  sopTitle: string;
  version: string;     // bump to invalidate prior passes
  vignette: string;
  options: SopComprehensionOption[];
  principle: string;   // one-line summary surfaced in the admin view
}

export const SOP_COMPREHENSION_QUESTIONS: SopComprehensionQuestion[] = [
  {
    sopSlug: "induction:sop-01-antt",
    sopTitle: "SOP 1 — Aseptic Non-Touch Technique (ANTT)",
    version: "1.0",
    principle:
      "Key parts and key sites must never be touched directly, regardless of time pressure.",
    vignette:
      "You are setting up a sterile field on a kitchen worktop for a PICC dressing change. The patient is anxious to leave for a hospital appointment in 20 minutes and asks you to 'just be quick'. While opening the dressing pack you notice you've momentarily touched the inside of the saline bung with your gloved finger.",
    options: [
      {
        id: "a",
        label: "Continue — your gloves were sterile when you put them on, so the bung is still safe.",
        isCorrect: false,
        explanation:
          "Gloves are not the sterile barrier — the key part is. Once a key part has been touched it is contaminated regardless of glove status.",
      },
      {
        id: "b",
        label: "Discard the contaminated bung, replace it from a new pack, and document the deviation.",
        isCorrect: true,
        explanation:
          "Correct. ANTT requires you to protect key parts at all times; if one is compromised you replace it and record the action — time pressure does not change this.",
      },
      {
        id: "c",
        label: "Wipe the bung with an alcohol swab for 30 seconds and proceed.",
        isCorrect: false,
        explanation:
          "Decontamination of a touched key part is not equivalent to maintaining asepsis — you must replace the item.",
      },
      {
        id: "d",
        label: "Reschedule the visit for tomorrow to avoid the time pressure.",
        isCorrect: false,
        explanation:
          "Cancelling a clinically necessary procedure is disproportionate; the correct action is to replace the item and proceed safely.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-02-venepuncture",
    sopTitle: "SOP 2 — Venepuncture for Blood Sampling",
    version: "1.0",
    principle:
      "Patient identity and sample labelling are checked at the bedside, never retrospectively.",
    vignette:
      "You have drawn three sample tubes from a patient at home. You realise you forgot to bring your label printer and the request form is in the car. The patient's daughter offers to write the names on the tubes while you go to fetch the form.",
    options: [
      {
        id: "a",
        label: "Accept the help — the daughter knows her mother's details.",
        isCorrect: false,
        explanation:
          "Sample labelling is a clinician-only task tied to positive ID at the point of draw; delegating to a relative is a never-event.",
      },
      {
        id: "b",
        label: "Discard the samples, fetch the labels, and re-draw with the patient.",
        isCorrect: true,
        explanation:
          "Correct. Unlabelled samples drawn out of sight of the labeller cannot be safely matched — the only safe path is to discard and re-draw with proper ID at the bedside.",
      },
      {
        id: "c",
        label: "Initial the tubes yourself and label them in the car from memory.",
        isCorrect: false,
        explanation:
          "Labelling away from the patient breaks the positive-ID chain; the lab will (rightly) reject the sample.",
      },
      {
        id: "d",
        label: "Take a photo of the tubes next to the patient's ID document and label later from the photo.",
        isCorrect: false,
        explanation:
          "Photos are not an approved labelling method and create a data-protection issue. Re-draw with proper labels at the bedside.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-03-peripheral-iv",
    sopTitle: "SOP 3 — Peripheral IV Infusion (Butterfly) in the Home",
    version: "1.0",
    principle:
      "A new cannula site must be observed for the first 5–10 minutes; the nurse does not leave during this window.",
    vignette:
      "You have just sited a new butterfly for a one-hour infusion. The patient says they are fine, the infusion is running, and asks you to pop next door to a neighbour to drop off a parcel for them. You'll be 5 minutes max.",
    options: [
      {
        id: "a",
        label: "Go — the infusion is running and the patient is alert; 5 minutes is fine.",
        isCorrect: false,
        explanation:
          "Early extravasation, allergy, or vasovagal events typically present in the first few minutes; leaving is unsafe regardless of distance.",
      },
      {
        id: "b",
        label: "Pause the infusion, lock the line, drop the parcel, and resume on return.",
        isCorrect: false,
        explanation:
          "Pausing/restarting introduces unnecessary access to the line and still leaves the patient unattended with the line in situ.",
      },
      {
        id: "c",
        label: "Politely decline, explain the post-cannulation observation period, and offer to drop the parcel afterwards.",
        isCorrect: true,
        explanation:
          "Correct. Patient safety obligations supersede neighbourly favours; explain, stay, and help once the observation window is complete.",
      },
      {
        id: "d",
        label: "Ask the patient's spouse to watch for problems while you are gone.",
        isCorrect: false,
        explanation:
          "A relative is not a competent observer for IV complications; the nurse must remain.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-04-picc",
    sopTitle: "SOP 4 — IV Infusion via PICC",
    version: "1.0",
    principle:
      "Resistance on flush = stop. Never force a PICC; investigate first.",
    vignette:
      "You attempt to flush a PICC pre-infusion. The first 1ml goes in normally, then you feel firm resistance and the patient reports a 'pulling' sensation in the upper arm. There is no visible swelling.",
    options: [
      {
        id: "a",
        label: "Apply steady gentle pressure to push past the resistance — partial occlusions often clear with firmer flushing.",
        isCorrect: false,
        explanation:
          "Forcing a PICC can dislodge a clot, rupture the catheter, or extravasate medication. Stop immediately.",
      },
      {
        id: "b",
        label: "Stop, do not infuse, escalate to the prescribing team / vascular access service, and document.",
        isCorrect: true,
        explanation:
          "Correct. Resistance + new symptom is a stop-and-escalate signal; the line needs assessment before any further use.",
      },
      {
        id: "c",
        label: "Try a different syringe size — a 2ml will overcome the resistance.",
        isCorrect: false,
        explanation:
          "Smaller syringes generate higher pressures and can rupture the catheter — explicitly contraindicated.",
      },
      {
        id: "d",
        label: "Switch to the other lumen and proceed with the infusion.",
        isCorrect: false,
        explanation:
          "Resistance + symptoms requires assessment of the whole device, not a workaround on another lumen.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-05-port",
    sopTitle: "SOP 5 — IV Infusion via Implanted Port (TIVAD)",
    version: "1.0",
    principle:
      "Ports are accessed only with a non-coring needle and only after blood return is confirmed.",
    vignette:
      "You access an implanted port for a scheduled infusion. The needle sits comfortably, the patient is pain-free, the port flushes easily — but you cannot achieve any blood return. The patient says 'the last nurse said that was normal for me'.",
    options: [
      {
        id: "a",
        label: "Proceed — flushing freely is the more important sign and the patient confirms this is normal.",
        isCorrect: false,
        explanation:
          "Patient anecdote does not override the SOP. No blood return must be investigated before infusing.",
      },
      {
        id: "b",
        label: "Re-position the patient (arm raised, head turned, cough/Valsalva) and re-attempt; if still no return, stop and escalate.",
        isCorrect: true,
        explanation:
          "Correct. Standard pinch/positional manoeuvres are the first step; persistent loss of blood return needs medical/vascular review before infusing.",
      },
      {
        id: "c",
        label: "Withdraw the needle and re-access using a larger-gauge needle.",
        isCorrect: false,
        explanation:
          "Repeated access damages the septum without addressing the underlying cause (fibrin sheath, malposition, etc.).",
      },
      {
        id: "d",
        label: "Use a urokinase flush from your bag to dissolve the suspected clot.",
        isCorrect: false,
        explanation:
          "Thrombolytics are POM and cannot be used without a specific prescription for this episode.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-06-sharps",
    sopTitle: "SOP 6 — Sharps Injury and Body-Fluid Exposure",
    version: "1.0",
    principle:
      "Time-critical: encourage bleeding, irrigate, report to occupational health within the hour, then risk-assess.",
    vignette:
      "On a Sunday evening visit you sustain a needlestick from a used hypodermic. The patient is known HIV-negative. The clinic occupational health line is closed until Monday morning.",
    options: [
      {
        id: "a",
        label: "Wash and dress the wound, document, and call occupational health first thing Monday.",
        isCorrect: false,
        explanation:
          "Post-exposure prophylaxis (where indicated) is time-critical; you cannot wait until Monday.",
      },
      {
        id: "b",
        label: "Encourage bleeding, wash with soap and water, and attend the nearest A&E for risk assessment now.",
        isCorrect: true,
        explanation:
          "Correct. Out of hours the route is A&E for source-risk assessment and PEP decision; you also notify the on-call manager and complete the incident report.",
      },
      {
        id: "c",
        label: "Take the patient's serology result on trust and skip A&E since the source is HIV-negative.",
        isCorrect: false,
        explanation:
          "HIV status is one of several risks (HBV, HCV, source unknown for other infections); a formal assessment is still required.",
      },
      {
        id: "d",
        label: "Suck the wound to draw out any contaminated material.",
        isCorrect: false,
        explanation:
          "Sucking a wound is explicitly contraindicated — it can introduce infection and is not in the SOP.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-07-documentation",
    sopTitle: "SOP 7 — Defensible Documentation for Invasive Procedures",
    version: "1.0",
    principle:
      "Late entries are dated/timed when written and clearly marked 'late entry' — never back-dated.",
    vignette:
      "You realise the next morning that you forgot to chart an IM injection given at the end of yesterday's last visit. The medication was definitely given and the patient's family will confirm it.",
    options: [
      {
        id: "a",
        label: "Add the entry into yesterday's notes with yesterday's date so the chronology reads cleanly.",
        isCorrect: false,
        explanation:
          "Back-dating an entry is a serious record-keeping failure (and potentially fraud), regardless of intent.",
      },
      {
        id: "b",
        label: "Write a fresh entry with today's date and time, marked 'Late entry — refers to dose given at HH:MM yesterday', then notify your line manager.",
        isCorrect: true,
        explanation:
          "Correct. Defensible records are contemporaneous; when that fails, a transparent late entry is the only safe path, plus an incident note.",
      },
      {
        id: "c",
        label: "Don't chart it — the family is the witness and any chart entry now would be inaccurate.",
        isCorrect: false,
        explanation:
          "Failure to record a given dose creates a worse audit trail than a correctly-flagged late entry.",
      },
      {
        id: "d",
        label: "Ask a colleague who was on shift yesterday to chart it for you.",
        isCorrect: false,
        explanation:
          "A colleague who did not give the dose cannot record it — that is falsification.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-08-deterioration",
    sopTitle: "SOP 8 — Acute Deterioration & Medical Emergencies (NEWS2)",
    version: "1.0",
    principle:
      "NEWS2 ≥7, or a single parameter scoring 3, triggers immediate escalation regardless of how the patient 'looks'.",
    vignette:
      "On a routine visit your patient looks chatty and well. Their observations are: RR 22, SpO2 91% on air (target 94–98), HR 96, BP 118/72, Temp 37.1, AVPU Alert. NEWS2 = 5 with a single parameter (SpO2) scoring 3.",
    options: [
      {
        id: "a",
        label: "Repeat in 1 hour — they look fine and a NEWS2 of 5 isn't critical.",
        isCorrect: false,
        explanation:
          "A single parameter scoring 3 mandates urgent escalation regardless of the aggregate NEWS2 or how the patient appears.",
      },
      {
        id: "b",
        label: "Call 999 immediately for a Cat-1 ambulance.",
        isCorrect: false,
        explanation:
          "999 is for life-threatening presentations; the SOP for a single 3-scoring parameter is urgent clinician review (GP / on-call / 111) — not necessarily 999.",
      },
      {
        id: "c",
        label: "Stay with the patient, escalate urgently to the GP / on-call team for review, document, and reassess every 15 minutes until reviewed.",
        isCorrect: true,
        explanation:
          "Correct. Single parameter scoring 3 triggers urgent clinical review with continued monitoring on scene — the SOP's exact escalation tier.",
      },
      {
        id: "d",
        label: "Apply oxygen from your bag at 4 L/min via nasal cannula until the SpO2 is above 95%.",
        isCorrect: false,
        explanation:
          "Oxygen is a prescribed drug; community nurses do not initiate it without a prescription or PGD. Escalate first.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-09-cold-chain",
    sopTitle: "SOP 9 — Cold Chain & Temperature Management for Medicines",
    version: "1.0",
    principle:
      "A broken cold chain = quarantine + pharmacy advice. Do not use, do not discard.",
    vignette:
      "You arrive at the patient with a cold-chain medication only to find the cool-bag's data logger has been reading 11°C for the past 2 hours. The patient is due their dose now.",
    options: [
      {
        id: "a",
        label: "Administer — the patient is due and the temperature was only marginally above the limit.",
        isCorrect: false,
        explanation:
          "Once the cold chain is broken the medicine cannot be used until pharmacy advises on stability; 'marginal' is not your judgement to make.",
      },
      {
        id: "b",
        label: "Discard the vial and write it off as wastage.",
        isCorrect: false,
        explanation:
          "Discarding without pharmacy review wastes a controlled stock item that may still be usable.",
      },
      {
        id: "c",
        label: "Quarantine the medicine in a labelled bag, contact pharmacy for a stability decision, document, and arrange a fresh dose.",
        isCorrect: true,
        explanation:
          "Correct. The SOP is quarantine-then-advice; pharmacy will decide use/dispose, and a fresh supply is arranged in parallel.",
      },
      {
        id: "d",
        label: "Put the medicine straight into the patient's home fridge to bring the temperature back down, then administer in 30 minutes.",
        isCorrect: false,
        explanation:
          "Re-cooling does not reverse degradation; the cold-chain breach must still be assessed by pharmacy.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-10-safeguarding",
    sopTitle: "SOP 10 — Safeguarding Adults and Children",
    version: "1.0",
    principle:
      "A safeguarding concern is escalated the same day to the safeguarding lead — a patient's request for confidentiality cannot override that duty.",
    vignette:
      "An elderly patient discloses that her live-in son shouts at her, controls her finances, and 'sometimes grabs her arm hard'. She is mentally competent and asks you not to tell anyone because she is frightened of social services 'taking him away'.",
    options: [
      {
        id: "a",
        label: "Respect her wishes — she has capacity and the choice is hers.",
        isCorrect: false,
        explanation:
          "Capacity to refuse social-services involvement does not override the nurse's professional duty to escalate a safeguarding concern.",
      },
      {
        id: "b",
        label: "Escalate to the safeguarding lead today, document factually, and explain to the patient what you are doing and why.",
        isCorrect: true,
        explanation:
          "Correct. Same-day escalation, transparent communication with the patient, and factual documentation are the SOP — confidentiality is overridden by the safeguarding duty.",
      },
      {
        id: "c",
        label: "Wait until your next visit to see whether the situation looks worse.",
        isCorrect: false,
        explanation:
          "Delay puts the patient at ongoing risk and is a breach of the safeguarding duty.",
      },
      {
        id: "d",
        label: "Confront the son when he comes back from work to give him a chance to explain.",
        isCorrect: false,
        explanation:
          "Confronting a suspected perpetrator alone risks escalating harm to the patient and is not the SOP route.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-11-consent",
    sopTitle: "SOP 11 — Consent, Capacity, and Best-Interests Decisions",
    version: "1.0",
    principle:
      "Capacity is decision-specific and time-specific. Refusal by a capacitous adult must be respected even if unwise.",
    vignette:
      "Your patient has a long-term diagnosis of mild dementia. Today she clearly understands you are offering her insulin, knows what diabetes is, and refuses the dose because 'I just don't want it today'. She can repeat back the risks (hyperglycaemia, hospital admission).",
    options: [
      {
        id: "a",
        label: "Administer anyway — her dementia diagnosis means she lacks capacity and a best-interests decision applies.",
        isCorrect: false,
        explanation:
          "Capacity is decision- and time-specific; a dementia diagnosis is not a blanket loss of capacity.",
      },
      {
        id: "b",
        label: "Document the capacity assessment, respect the refusal, escalate to the prescriber, and reassess at the next visit.",
        isCorrect: true,
        explanation:
          "Correct. She has capacity for this decision; her refusal is valid and unwise decisions remain her right. Document and escalate for review.",
      },
      {
        id: "c",
        label: "Get her daughter on the phone to override the refusal.",
        isCorrect: false,
        explanation:
          "A relative cannot override a capacitous adult's refusal (no UK lasting power applies to a competent decision-maker).",
      },
      {
        id: "d",
        label: "Mix the insulin into her tea so she takes it without distress.",
        isCorrect: false,
        explanation:
          "Covert administration to a competent adult is assault and a serious professional misconduct.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-12-medicines",
    sopTitle: "SOP 12 — Medicines Administration & Infusion Safety Checks",
    version: "1.0",
    principle:
      "The 6 Rs (right patient, drug, dose, route, time, documentation) are checked at the bedside, not in the car.",
    vignette:
      "You realise after leaving the patient's house that the antibiotic dose you just gave was 1g IV — but the prescription chart actually said 500mg. The patient was alert, looked well, and you confirmed identity correctly.",
    options: [
      {
        id: "a",
        label: "Note it in your handover and mention it at the team meeting next week.",
        isCorrect: false,
        explanation:
          "A medication error is reportable immediately, not noted for next week's meeting.",
      },
      {
        id: "b",
        label: "Return to the patient, perform observations, contact the prescriber for advice, complete an incident report (Datix), and inform the patient.",
        isCorrect: true,
        explanation:
          "Correct. Patient first (assess + escalate), then transparent communication and incident reporting — same hour, not next week.",
      },
      {
        id: "c",
        label: "Don't report it — the antibiotic was within a safe dose range and no harm occurred.",
        isCorrect: false,
        explanation:
          "Near-miss reporting is mandatory regardless of harm; under-reporting hides systemic risks.",
      },
      {
        id: "d",
        label: "Halve the next scheduled dose to compensate for the overdose.",
        isCorrect: false,
        explanation:
          "Adjusting doses to 'compensate' is not your decision — escalate to the prescriber.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-13-handover-sbar",
    sopTitle: "SOP 13 — Clinical Handover & SBAR",
    version: "1.0",
    principle:
      "Handover is structured, time-bound, and uses SBAR — not a free-text narrative.",
    vignette:
      "You need to phone the GP urgently about a patient whose wound now looks infected. You have 90 seconds before the GP has to take their next call.",
    options: [
      {
        id: "a",
        label: "Tell the story chronologically from the start of the visit so they have full context.",
        isCorrect: false,
        explanation:
          "Narrative handovers under time pressure bury the actionable information — this is what SBAR was designed to fix.",
      },
      {
        id: "b",
        label: "Lead with: 'Situation: I'm worried about an infected wound. Background: 2-week post-op leg wound, on co-amoxiclav. Assessment: spreading erythema, NEWS2 4. Recommendation: please review today or advise antibiotics change.'",
        isCorrect: true,
        explanation:
          "Correct. Compact SBAR delivers the clinical question and the ask in under 60 seconds — exactly the SOP's recommended format.",
      },
      {
        id: "c",
        label: "Send a long secure-message instead so they can read at leisure.",
        isCorrect: false,
        explanation:
          "Asynchronous messaging is unsuitable for an urgent clinical question — phone with SBAR.",
      },
      {
        id: "d",
        label: "Ask the receptionist to triage whether it sounds important enough to disturb the GP.",
        isCorrect: false,
        explanation:
          "Clinical triage is a clinician's responsibility; non-clinical staff cannot grade an urgent nursing concern.",
      },
    ],
  },
  {
    sopSlug: "induction:sop-14-complaints",
    sopTitle: "SOP 14 — Concerns, Complaints and Feedback",
    version: "1.0",
    principle:
      "Acknowledge the concern at the time, log it the same day, and never promise an outcome you can't guarantee.",
    vignette:
      "A patient's son meets you at the door, visibly angry, saying yesterday's nurse 'rushed the visit and was rude'. You weren't there yesterday. He demands you guarantee that nurse 'will be sacked'.",
    options: [
      {
        id: "a",
        label: "Agree the nurse will be sacked to defuse the situation, then forget about it.",
        isCorrect: false,
        explanation:
          "Promising a disciplinary outcome you cannot deliver is a breach of trust and a complaints-handling failure.",
      },
      {
        id: "b",
        label: "Acknowledge the concern calmly, apologise that he feels this way, explain you will log it today and the team will be in touch, and complete the visit.",
        isCorrect: true,
        explanation:
          "Correct. Acknowledge → apologise for the experience (not blame) → log same-day → defer outcome to the formal process — exactly the SOP.",
      },
      {
        id: "c",
        label: "Refuse to do today's visit until he calms down.",
        isCorrect: false,
        explanation:
          "Withholding clinically necessary care over a complaint penalises the patient, not the source of the concern.",
      },
      {
        id: "d",
        label: "Defend yesterday's nurse — you know them and they wouldn't have been rude.",
        isCorrect: false,
        explanation:
          "Defending a colleague before the concern is investigated dismisses the complainant and breaches the SOP.",
      },
    ],
  },
];

export function getSopComprehensionQuestion(sopSlug: string): SopComprehensionQuestion | undefined {
  return SOP_COMPREHENSION_QUESTIONS.find((q) => q.sopSlug === sopSlug);
}
