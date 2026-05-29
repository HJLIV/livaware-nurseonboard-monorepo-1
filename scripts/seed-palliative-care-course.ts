import { storage } from "../server/storage";

/**
 * Seeds the first course in the Palliative Care series:
 * "Palliative Care 1 — Principles of Palliative & End-of-Life Care".
 *
 * Idempotent: if a course with the same title already exists it is left
 * untouched (no duplicate is created).
 *
 * Run with:  npx tsx scripts/seed-palliative-care-course.ts
 */

const COURSE_TITLE =
  "Palliative Care 1 — Principles of Palliative & End-of-Life Care";

const LESSONS: { title: string; content: string }[] = [
  {
    title: "What is palliative care?",
    content: `Palliative care is an approach that improves the quality of life of patients and their families facing the problems associated with life-limiting illness. It does this through the prevention and relief of suffering by means of early identification, careful assessment, and treatment of pain and other problems — physical, psychosocial and spiritual (World Health Organization).

Key principles:

- It affirms life and regards dying as a normal process.
- It intends neither to hasten nor postpone death.
- It integrates the psychological and spiritual aspects of patient care.
- It offers a support system to help patients live as actively as possible until death.
- It offers a support system to help the family cope during the patient's illness and in their own bereavement.

Palliative care is not the same as end-of-life care. Palliative care can be provided alongside curative or life-prolonging treatment at any stage of a serious illness. End-of-life care is the palliative care delivered in the last weeks, days and hours of a person's life.

Palliative care is everyone's business — it is delivered by generalist clinicians (such as community nurses and GPs) with support, where needed, from specialist palliative care teams.`,
  },
  {
    title: "Holistic assessment and the multidisciplinary team",
    content: `Good palliative care begins with a holistic assessment that looks at the whole person, not just their diagnosis. A widely used framework considers four domains:

1. Physical — pain, breathlessness, nausea, fatigue, appetite, mobility.
2. Psychological — anxiety, depression, fear, adjustment to illness.
3. Social — family, finances, housing, carer support, work.
4. Spiritual — meaning, hope, faith, identity and legacy.

The multidisciplinary team (MDT) works together to meet these needs. Members can include:

- Nurses (community, hospice, hospital and specialist palliative care nurses)
- GPs and hospital doctors
- Specialist palliative care consultants
- Healthcare assistants
- Physiotherapists and occupational therapists
- Social workers
- Chaplains and spiritual care leads
- Pharmacists

The nurse is often the constant point of contact and plays a central role in coordinating care, advocating for the patient, and ensuring the patient's and family's wishes are heard and recorded.

Person-centred care means decisions are made with the patient, not for them. Always involve the patient (and, with their consent, those important to them) in planning their care.`,
  },
  {
    title: "Common symptoms and comfort measures",
    content: `Symptom control is a cornerstone of palliative care. The most common symptoms and the nurse's role in managing them include:

Pain
- Assess regularly using a tool appropriate to the patient (e.g. numeric rating scale, or Abbey Pain Scale for those who cannot self-report).
- Follow the WHO analgesic ladder; report uncontrolled pain promptly.
- Remember that pain is not only physical — "total pain" includes emotional, social and spiritual distress.

Breathlessness
- Position the patient upright, use a handheld fan, keep the room cool and calm.
- Reassure — anxiety and breathlessness feed each other.

Nausea and vomiting
- Identify the likely cause; offer small, frequent meals and good mouth care.

Constipation
- Anticipate it, especially with opioids; encourage fluids and report changes.

Mouth care
- Frequent, gentle oral care greatly improves comfort, particularly when a patient can no longer eat or drink.

Anticipatory prescribing
- For patients approaching the end of life, medicines for pain, agitation, breathlessness, nausea and respiratory secretions are often prescribed in advance ("just in case" medicines) so symptoms can be treated without delay.

Always document symptoms, the actions you took, and the effect. Escalate to senior or specialist colleagues when symptoms are not controlled.`,
  },
  {
    title: "Communication, advance care planning and the dying phase",
    content: `Sensitive communication is one of the most important skills in palliative care.

Communicating well
- Use clear, simple language and avoid jargon and euphemisms that can confuse.
- Allow silence; give the patient time to take in information and respond.
- Listen more than you speak, and check understanding.
- Be honest while remaining compassionate and hopeful about comfort and dignity.

Advance care planning (ACP)
ACP is a voluntary process of discussion about future care between a person and their care providers. It may result in:
- An Advance Statement (preferences and wishes).
- An Advance Decision to Refuse Treatment (ADRT), which is legally binding.
- Appointment of a Lasting Power of Attorney for health and welfare.
- A recommendation such as a DNACPR or ReSPECT form regarding resuscitation.

Recognising the dying phase
Signs that a person may be entering the last days of life include profound weakness, being bedbound, only able to take sips of fluid, increasing drowsiness, and reduced consciousness. Recognising this allows the team to focus on comfort, stop non-essential interventions, and support the family.

Care after death
Provide dignified care of the body, follow local procedures, and offer the family time and bereavement support. Caring for the family is part of caring for the patient.

Looking after yourself
Palliative care can be emotionally demanding. Use clinical supervision, peer support and reflection to maintain your own wellbeing.`,
  },
];

const QUESTIONS: {
  prompt: string;
  options: string[];
  correctIndex: number;
}[] = [
  {
    prompt: "Which statement best describes palliative care?",
    options: [
      "Care given only in the final hours of life",
      "An approach that improves quality of life for people with life-limiting illness and their families",
      "Treatment intended to hasten death",
      "Care that can only be delivered by specialist consultants",
    ],
    correctIndex: 1,
  },
  {
    prompt: "Palliative care can be provided:",
    options: [
      "Only after all curative treatment has stopped",
      "Only in a hospice setting",
      "Alongside curative or life-prolonging treatment at any stage of a serious illness",
      "Only by the patient's GP",
    ],
    correctIndex: 2,
  },
  {
    prompt:
      "A holistic palliative assessment considers physical, psychological, social and which other domain?",
    options: ["Financial only", "Spiritual", "Legal", "Dietary only"],
    correctIndex: 1,
  },
  {
    prompt: "The concept of 'total pain' recognises that pain can be:",
    options: [
      "Only physical",
      "Physical, emotional, social and spiritual",
      "Always relieved by a single medicine",
      "Unimportant in palliative care",
    ],
    correctIndex: 1,
  },
  {
    prompt:
      "Which of the following is a legally binding part of advance care planning?",
    options: [
      "An Advance Statement of wishes",
      "A verbal comment to a friend",
      "An Advance Decision to Refuse Treatment (ADRT)",
      "A note in the nurse's personal diary",
    ],
    correctIndex: 2,
  },
  {
    prompt:
      "Which of these is a recognised sign that a person may be entering the last days of life?",
    options: [
      "Increased appetite and energy",
      "Profound weakness, being bedbound and increasing drowsiness",
      "Improved mobility",
      "Reduced need for mouth care",
    ],
    correctIndex: 1,
  },
];

async function main() {
  const existing = await storage.getLmsCourses();
  const already = existing.find(
    (c) => c.title.trim().toLowerCase() === COURSE_TITLE.toLowerCase(),
  );
  if (already) {
    console.log(
      `Course already exists (id=${already.id}) — nothing to do. Delete it first if you want to re-seed.`,
    );
    return;
  }

  const course = await storage.createLmsCourse({
    title: COURSE_TITLE,
    description:
      "The first course in the palliative care series. An introduction to the principles of palliative and end-of-life care: what palliative care is, holistic assessment and the MDT, common symptoms and comfort measures, and communication, advance care planning and the dying phase.",
    sourceType: "internal",
    category: "Palliative Care",
    passThreshold: 80,
    certificateEnabled: true,
    isActive: true,
    createdBy: "seed script",
  });
  console.log(`Created course "${course.title}" (id=${course.id})`);

  for (let i = 0; i < LESSONS.length; i++) {
    const l = LESSONS[i];
    await storage.createLmsLesson({
      courseId: course.id,
      title: l.title,
      content: l.content,
      orderIndex: i,
    });
    console.log(`  + lesson ${i + 1}: ${l.title}`);
  }

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    await storage.createLmsQuizQuestion({
      courseId: course.id,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      orderIndex: i,
    });
    console.log(`  + question ${i + 1}: ${q.prompt}`);
  }

  console.log(
    `\nDone. ${LESSONS.length} lessons and ${QUESTIONS.length} quiz questions added. Pass mark: ${course.passThreshold}%.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed palliative care course:", err);
    process.exit(1);
  });
