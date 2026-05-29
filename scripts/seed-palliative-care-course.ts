import { readFileSync } from "fs";
import { join } from "path";
import { storage } from "../server/storage";

/**
 * Seeds the full Palliative Care training course (all 8 modules) using the
 * real training content supplied by Livaware (Training-Livaware-Palliative-Care
 * export).
 *
 * The 8 source modules are converted from their original HTML to clean,
 * readable plain text (the portal course player renders lesson content as
 * plain text with whitespace-pre-wrap) and stored in
 * scripts/data/palliative-care-lessons.json. Each module becomes one lesson.
 * A knowledge-check quiz drawn from the content of every module is included
 * (the source app had no quiz data of its own).
 *
 * Idempotent: re-running finds the existing course (by current or earlier
 * title), refreshes its title/description, and replaces all lessons/questions
 * so the content always matches this file. Also cleans up the earlier
 * placeholder course if it is still present.
 *
 * Run with:  npx tsx scripts/seed-palliative-care-course.ts
 */

const COURSE_TITLE = "Palliative Care — End of Life Care Programme";

// Earlier titles this course has had, matched so the seed is idempotent and
// upgrades an existing course in place rather than creating a duplicate.
const PREVIOUS_TITLES = [
  "Palliative Care 1 — End of Life Care Fundamentals",
];

// Title of the very first placeholder course, removed on re-seed if present.
const LEGACY_PLACEHOLDER_TITLE =
  "Palliative Care 1 — Principles of Palliative & End-of-Life Care";

const COURSE_DESCRIPTION =
  "The complete palliative and end-of-life care training programme, covering all eight modules: end of life care fundamentals, pain assessment and management, advance care planning, symptom management, communication skills, care of the dying, ethical and legal considerations, and bereavement and support.";

type Lesson = { title: string; content: string };

const LESSONS: Lesson[] = (
  JSON.parse(
    readFileSync(
      join(process.cwd(), "scripts", "data", "palliative-care-lessons.json"),
      "utf8",
    ),
  ) as { title: string; content: string }[]
).map((l) => ({ title: l.title, content: l.content }));

const QUESTIONS: {
  prompt: string;
  options: string[];
  correctIndex: number;
}[] = [
  // Module 1 — End of Life Care Fundamentals
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
      "Which trajectory is typically associated with conditions such as heart failure and COPD?",
    options: ["Cancer", "Organ failure", "Sudden death", "None of these"],
    correctIndex: 1,
  },
  // Module 2 — Pain Assessment and Management
  {
    prompt:
      "In the PQRST pain assessment method, the 'S' stands for:",
    options: ["Site only", "Severity", "Spiritual", "Sedation"],
    correctIndex: 1,
  },
  {
    prompt:
      "The WHO analgesic ladder core principles are best summarised as:",
    options: [
      "By the clock, by the mouth, by the ladder",
      "As required only",
      "Strongest drug first",
      "Injections before tablets",
    ],
    correctIndex: 0,
  },
  {
    prompt:
      "Which symptom should laxatives be started for at the same time as commencing an opioid, because tolerance to it does not develop?",
    options: ["Nausea", "Drowsiness", "Constipation", "Respiratory depression"],
    correctIndex: 2,
  },
  // Module 3 — Advance Care Planning
  {
    prompt:
      "What does DNACPR stand for in advance care planning?",
    options: [
      "Do Not Attempt Cardiopulmonary Resuscitation",
      "Daily Nursing And Care Planning Record",
      "Discharge Notice And Care Plan Review",
      "Do Not Allow Critical Patient Referral",
    ],
    correctIndex: 0,
  },
  {
    prompt:
      "A Lasting Power of Attorney for health and welfare allows:",
    options: [
      "A clinician to overrule the patient at any time",
      "An appointed person to make health and welfare decisions when capacity is lost",
      "The family to access the patient's bank accounts",
      "The hospital to discharge the patient automatically",
    ],
    correctIndex: 1,
  },
  // Module 4 — Symptom Management
  {
    prompt:
      "Which first-line anti-emetic is prokinetic and used for gastric stasis, but should be avoided in bowel obstruction?",
    options: ["Cyclizine", "Metoclopramide", "Ondansetron", "Haloperidol"],
    correctIndex: 1,
  },
  {
    prompt:
      "Which is recommended as a first-line, non-pharmacological intervention for breathlessness?",
    options: [
      "Routine high-flow oxygen for everyone",
      "Fan therapy (cool air flow over the face) and upright positioning",
      "Strict bed rest in a warm room",
      "Immediate sedation",
    ],
    correctIndex: 1,
  },
  // Module 5 — Communication Skills
  {
    prompt:
      "In the SPIKES framework for breaking bad news, the 'P' stands for:",
    options: ["Prescription", "Perception", "Prognosis", "Privacy"],
    correctIndex: 1,
  },
  // Module 6 — Care of the Dying
  {
    prompt:
      "Anticipatory prescribing in the last days of life means:",
    options: [
      "Prescribing medication in advance so symptoms can be relieved quickly without delay",
      "Withholding all medication until symptoms are severe",
      "Only prescribing antibiotics",
      "Stopping all comfort medication",
    ],
    correctIndex: 0,
  },
  {
    prompt:
      "Noisy respiratory secretions at the end of life ('death rattle') are:",
    options: [
      "Always a sign of severe patient distress requiring intubation",
      "Often more distressing for the family than for the patient, managed with positioning and antisecretory drugs",
      "Best treated with aggressive deep suctioning in all cases",
      "A reason to start artificial hydration",
    ],
    correctIndex: 1,
  },
  // Module 7 — Ethical and Legal Considerations
  {
    prompt:
      "Which is a core principle of the Mental Capacity Act?",
    options: [
      "Capacity must be proven before anyone can make a decision",
      "People may not make decisions others consider unwise",
      "Every adult is presumed to have capacity unless proven otherwise",
      "Best interests never apply",
    ],
    correctIndex: 2,
  },
  {
    prompt:
      "The four-part functional test of capacity is whether a person can understand, retain, use/weigh, and:",
    options: [
      "Communicate their decision",
      "Read and write",
      "Name their next of kin",
      "Walk unaided",
    ],
    correctIndex: 0,
  },
  // Module 8 — Bereavement and Support
  {
    prompt:
      "Which of the following is a recognised warning sign of complicated grief that should prompt referral?",
    options: [
      "Sadness in the first week after a death",
      "Intense grief persisting beyond 12 months with significant functional impairment",
      "Attending the funeral",
      "Talking about the person who died",
    ],
    correctIndex: 1,
  },
];

async function clearCourseContent(courseId: string) {
  const lessons = await storage.getLmsLessons(courseId);
  for (const l of lessons) await storage.deleteLmsLesson(l.id);
  const questions = await storage.getLmsQuizQuestions(courseId);
  for (const q of questions) await storage.deleteLmsQuizQuestion(q.id);
}

async function main() {
  // Include inactive courses so re-running always upgrades the existing course
  // in place rather than creating a duplicate.
  const existing = await storage.getLmsCourses(true);

  // Remove the earliest placeholder course if it is still around.
  const placeholder = existing.find(
    (c) => c.title.trim().toLowerCase() === LEGACY_PLACEHOLDER_TITLE.toLowerCase(),
  );
  if (placeholder) {
    await clearCourseContent(placeholder.id);
    await storage.deleteLmsCourse(placeholder.id);
    console.log(`Removed legacy placeholder course (id=${placeholder.id}).`);
  }

  const matchTitles = [COURSE_TITLE, ...PREVIOUS_TITLES].map((t) =>
    t.trim().toLowerCase(),
  );
  let course = existing.find((c) =>
    matchTitles.includes(c.title.trim().toLowerCase()),
  );

  if (course) {
    await clearCourseContent(course.id);
    const updated = await storage.updateLmsCourse(course.id, {
      title: COURSE_TITLE,
      description: COURSE_DESCRIPTION,
      category: "Palliative Care",
      passThreshold: 80,
      certificateEnabled: true,
      isActive: true,
    });
    if (updated) course = updated;
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
