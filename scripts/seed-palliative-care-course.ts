import { storage } from "../server/storage";

/**
 * Seeds the first course in the Palliative Care series using the real
 * "End of Life Care Fundamentals" training content supplied by Livaware
 * (Training-Livaware-Palliative-Care export, module 1 of 8).
 *
 * The portal course player renders lesson content as plain text
 * (whitespace-pre-wrap), so the source HTML has been faithfully converted
 * to clean, readable plain text and split into lessons by the module's
 * natural sections. A short knowledge-check quiz drawn from this content
 * is included (the source app had no quiz data of its own).
 *
 * Idempotent: re-running replaces the course's lessons/questions so the
 * content always matches this file. Also cleans up the earlier placeholder
 * course if it is still present.
 *
 * Run with:  npx tsx scripts/seed-palliative-care-course.ts
 */

const COURSE_TITLE = "Palliative Care 1 — End of Life Care Fundamentals";

// Title of the earlier placeholder course, removed on re-seed if present.
const LEGACY_PLACEHOLDER_TITLE =
  "Palliative Care 1 — Principles of Palliative & End-of-Life Care";

const COURSE_DESCRIPTION =
  "The first course in the palliative care series. Core concepts of palliative and end-of-life care: defining end of life care, identifying people approaching the end of life, the quality standards that underpin good care, the common disease trajectories, and how quality is measured.";

const LESSONS: { title: string; content: string }[] = [
  {
    title: "Defining end of life care",
    content: `Definition of End of Life Care (GMC 2010)

People are 'approaching the end of life' when they are likely to die within the next 12 months. This includes people whose death is imminent (expected within a few hours or days) and those with:

- Advanced, progressive, incurable conditions
- General frailty and co-existing conditions that mean they are expected to die within 12 months
- Existing conditions if they are at risk of dying from a sudden acute crisis
- Life-threatening acute conditions caused by sudden catastrophic events

Recognising that someone is approaching the end of life is the first step in making sure their care is planned around their needs and wishes, rather than reacting to crises as they happen.`,
  },
  {
    title: "Identifying people approaching the end of life",
    content: `Gold Standards Framework (GSF) Prognostic Indicators

The Gold Standards Framework sets out three key triggers that help teams identify people who are approaching the end of life:

1. The Surprise Question: "Would you be surprised if this patient were to die in the next few months, weeks, days?"

2. General Indicators: Deterioration, increasing need, or choice for no further active care.

3. Specific Clinical Indicators: Disease-specific prognostic markers.

Using these triggers in a systematic way helps make sure people are identified in a timely manner, so that advance care planning and supportive care can begin early.`,
  },
  {
    title: "Quality standards for end of life care",
    content: `Four quality statements describe what good end of life care looks like:

Quality Statement 1 — Identification
People approaching the end of life are identified in a timely way and their needs are assessed. This includes the use of prognostic indicators and systematic identification processes.

Quality Statement 2 — Advance Care Planning
People identified as approaching the end of life, and their families and carers, are offered advance care planning, including discussions about preferences, values and goals of care.

Quality Statement 3 — Coordinated Care
People approaching the end of life receive coordinated care that meets their individual needs, using a multi-disciplinary approach with clear communication pathways.

Quality Statement 4 — Out-of-Hours Care
People approaching the end of life have access to high-quality care at all times, with 24/7 access to specialist advice and emergency care plans.`,
  },
  {
    title: "Disease trajectories and prognostication",
    content: `Understanding the typical patterns of decline helps the team anticipate needs and plan care.

Cancer trajectory (around 20% of deaths)
Characterised by relatively high function until a rapid decline in the final weeks or months.
- Prognostic indicators: progressive weight loss over 10%, performance status decline, disease progression despite treatment.
- Timeline: often 2–6 months from diagnosis of advanced disease.
- Management: symptom control, treatment decision-making, psychosocial support.

Organ failure trajectory (around 20% of deaths)
Gradual decline with periodic acute exacerbations and partial recovery.
- Examples: heart failure, COPD, chronic kidney disease, liver disease.
- Challenges: uncertain prognosis, frequent hospital admissions.
- Management: optimise medical management, advance care planning, rehabilitation.

Frailty / dementia trajectory (around 40% of deaths)
Prolonged gradual decline with increasing dependency over years.
- Characteristics: progressive functional decline, recurrent infections, swallowing difficulties.
- Prognosis: very unpredictable timing, often years of decline.
- Management: comfort care, family support, dignity preservation.

Sudden death (around 20% of deaths)
Unexpected death with little or no warning period.
- Examples: sudden cardiac death, stroke, major trauma, pulmonary embolism.
- Preparation: general advance care planning for high-risk patients.
- Support: immediate bereavement support for families.`,
  },
  {
    title: "Measuring quality of care",
    content: `Key performance indicators help services measure the quality of end of life care. Measurable outcomes include:

- Proportion of patients with advance care plans documented
- Percentage of patients dying in their preferred place of care
- Hospital admission rates in the last month of life
- Family satisfaction with care coordination
- Time from identification to specialist palliative care referral
- Documentation of spiritual and cultural needs assessment

Tracking these outcomes helps teams understand where care is working well and where it can be improved.`,
  },
];

const QUESTIONS: {
  prompt: string;
  options: string[];
  correctIndex: number;
}[] = [
  {
    prompt:
      "According to the GMC (2010), people are 'approaching the end of life' when they are likely to die within:",
    options: ["The next 12 months", "The next 5 years", "A few hours", "The next month only"],
    correctIndex: 0,
  },
  {
    prompt:
      "Which of these is one of the three key triggers in the Gold Standards Framework?",
    options: [
      "The patient's age alone",
      "The Surprise Question",
      "The number of medications prescribed",
      "The patient's postcode",
    ],
    correctIndex: 1,
  },
  {
    prompt:
      "Quality Statement 1 for end of life care is concerned with:",
    options: [
      "Timely identification of people approaching the end of life and assessment of their needs",
      "Discharge planning only",
      "Reducing staff costs",
      "Restricting visiting hours",
    ],
    correctIndex: 0,
  },
  {
    prompt:
      "The frailty / dementia trajectory is best described as:",
    options: [
      "High function until a rapid decline in the final weeks",
      "Sudden, unexpected death",
      "A prolonged, gradual decline with increasing dependency over years",
      "A short illness lasting only days",
    ],
    correctIndex: 2,
  },
  {
    prompt:
      "Which trajectory is typically associated with conditions such as heart failure and COPD?",
    options: ["Cancer", "Organ failure", "Sudden death", "None of these"],
    correctIndex: 1,
  },
  {
    prompt:
      "Which of the following is a recognised key performance indicator for quality end of life care?",
    options: [
      "Percentage of patients dying in their preferred place of care",
      "Number of beds in the ward",
      "Average length of staff lunch breaks",
      "Colour of the patient's room",
    ],
    correctIndex: 0,
  },
];

async function clearCourseContent(courseId: string) {
  const lessons = await storage.getLmsLessons(courseId);
  for (const l of lessons) await storage.deleteLmsLesson(l.id);
  const questions = await storage.getLmsQuizQuestions(courseId);
  for (const q of questions) await storage.deleteLmsQuizQuestion(q.id);
}

async function main() {
  const existing = await storage.getLmsCourses();

  // Remove the earlier placeholder course if it is still around.
  const placeholder = existing.find(
    (c) => c.title.trim().toLowerCase() === LEGACY_PLACEHOLDER_TITLE.toLowerCase(),
  );
  if (placeholder) {
    await clearCourseContent(placeholder.id);
    await storage.deleteLmsCourse(placeholder.id);
    console.log(`Removed legacy placeholder course (id=${placeholder.id}).`);
  }

  let course = existing.find(
    (c) => c.title.trim().toLowerCase() === COURSE_TITLE.toLowerCase(),
  );

  if (course) {
    await clearCourseContent(course.id);
    console.log(`Course already exists (id=${course.id}) — refreshing its content.`);
  } else {
    course = await storage.createLmsCourse({
      title: COURSE_TITLE,
      description: COURSE_DESCRIPTION,
      sourceType: "internal",
      category: "Palliative Care",
      passThreshold: 80,
      certificateEnabled: true,
      isActive: true,
      createdBy: "seed script",
    });
    console.log(`Created course "${course.title}" (id=${course.id})`);
  }

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
