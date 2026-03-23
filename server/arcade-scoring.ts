import type {
  ScenarioContent,
  ScenarioTask,
  OrderingTaskData,
  DecisionTaskData,
  CalculationTaskData,
  MatchingTaskData,
  ScoringResult,
  ScoringError,
} from "@shared/schema";

export interface TaskResponse {
  taskId: string;
  type: string;
  answer: any;
}

export function scoreAttempt(
  content: ScenarioContent,
  responses: TaskResponse[]
): ScoringResult {
  const errors: ScoringError[] = [];

  for (const task of content.tasks) {
    const response = responses.find((r) => r.taskId === task.id);
    if (!response) {
      errors.push({
        taskId: task.id,
        classification: "MAJOR",
        rationale: "Task not completed",
        detail: `"${task.title}" was not attempted.`,
      });
      continue;
    }

    switch (task.type) {
      case "ordering":
        scoreOrdering(task, task.data as OrderingTaskData, response.answer, errors);
        break;
      case "decision":
        scoreDecision(task, task.data as DecisionTaskData, response.answer, errors);
        break;
      case "calculation":
        scoreCalculation(task, task.data as CalculationTaskData, response.answer, errors);
        break;
      case "matching":
        scoreMatching(task, task.data as MatchingTaskData, response.answer, errors);
        break;
    }
  }

  const minorCount = errors.filter((e) => e.classification === "MINOR").length;
  const majorCount = errors.filter((e) => e.classification === "MAJOR").length;
  const passed = majorCount === 0 && minorCount <= 3;

  return { passed, minorCount, majorCount, errors };
}

function scoreOrdering(
  task: ScenarioTask,
  data: OrderingTaskData,
  answer: string[],
  errors: ScoringError[]
) {
  if (!Array.isArray(answer)) {
    errors.push({
      taskId: task.id,
      classification: "MAJOR",
      rationale: "Invalid response format",
      detail: `No valid ordering provided for "${task.title}".`,
    });
    return;
  }

  const correctIds = data.correctOrder.map((s) => s.id);
  const distractorIds = new Set((data.distractors ?? []).map((d) => d.id));

  const includedDistractors = answer.filter((id) => distractorIds.has(id));
  for (const distId of includedDistractors) {
    const dist = (data.distractors ?? []).find((d) => d.id === distId);
    if (dist) {
      errors.push({
        taskId: task.id,
        classification: dist.errorClassification ?? "MINOR",
        rationale: dist.errorRationale ?? "Included an incorrect step",
        detail: `Included unnecessary step: "${dist.text}"`,
      });
    }
  }

  const submittedCorrect = answer.filter((id) => !distractorIds.has(id));
  const missingSteps = correctIds.filter((id) => !submittedCorrect.includes(id));
  for (const missId of missingSteps) {
    const step = data.correctOrder.find((s) => s.id === missId);
    if (step) {
      errors.push({
        taskId: task.id,
        classification: step.errorClassification ?? "MINOR",
        rationale: step.errorRationale ?? "Missing required step",
        detail: `Missing step: "${step.text}"`,
      });
    }
  }

  let orderErrors = 0;
  for (let i = 0; i < submittedCorrect.length; i++) {
    const correctIndex = correctIds.indexOf(submittedCorrect[i]);
    if (correctIndex !== i) {
      orderErrors++;
    }
  }

  if (orderErrors > 0) {
    const severity = orderErrors >= 3 ? "MAJOR" : "MINOR";
    const criticalMisorder = checkCriticalMisorder(data, submittedCorrect);
    errors.push({
      taskId: task.id,
      classification: criticalMisorder ? "MAJOR" : severity,
      rationale: criticalMisorder
        ? "Critical steps performed out of sequence, creating a safety risk"
        : "Steps performed slightly out of optimal order",
      detail: `${orderErrors} step(s) placed in the wrong position.`,
    });
  }
}

function checkCriticalMisorder(data: OrderingTaskData, submitted: string[]): boolean {
  const correctIds = data.correctOrder.map((s) => s.id);
  if (correctIds.length < 3) return false;

  const firstCorrect = correctIds[0];
  const lastCorrect = correctIds[correctIds.length - 1];
  const submittedFirstIdx = submitted.indexOf(firstCorrect);
  const submittedLastIdx = submitted.indexOf(lastCorrect);

  if (submittedFirstIdx > submitted.length / 2) return true;
  if (submittedLastIdx >= 0 && submittedLastIdx < submitted.length / 3) return true;

  return false;
}

function scoreDecision(
  task: ScenarioTask,
  data: DecisionTaskData,
  answer: Record<string, string>,
  errors: ScoringError[]
) {
  if (!answer || typeof answer !== "object") {
    errors.push({
      taskId: task.id,
      classification: "MAJOR",
      rationale: "No decisions made",
      detail: `No responses provided for "${task.title}".`,
    });
    return;
  }

  for (const [nodeId, optionId] of Object.entries(answer)) {
    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    const selectedOption = node.options.find((o) => o.id === optionId);
    if (!selectedOption) continue;

    if (!selectedOption.isCorrect) {
      errors.push({
        taskId: task.id,
        classification: selectedOption.errorClassification ?? "MINOR",
        rationale: selectedOption.errorRationale ?? "Incorrect decision",
        detail: selectedOption.feedback ?? `Wrong choice at: "${node.prompt}"`,
      });
    }
  }
}

function scoreCalculation(
  task: ScenarioTask,
  data: CalculationTaskData,
  answer: number,
  errors: ScoringError[]
) {
  if (answer === null || answer === undefined || isNaN(answer)) {
    errors.push({
      taskId: task.id,
      classification: data.errorClassification,
      rationale: data.errorRationale,
      detail: `No answer provided for calculation in "${task.title}".`,
    });
    return;
  }

  const diff = Math.abs(answer - data.correctAnswer);
  if (diff > data.tolerance) {
    errors.push({
      taskId: task.id,
      classification: data.errorClassification,
      rationale: data.errorRationale,
      detail: `Answer ${answer} ${data.unit} is incorrect. Expected approximately ${data.correctAnswer} ${data.unit} (tolerance: ±${data.tolerance}).`,
    });
  }
}

function scoreMatching(
  task: ScenarioTask,
  data: MatchingTaskData,
  answer: Record<string, string>,
  errors: ScoringError[]
) {
  if (!answer || typeof answer !== "object") {
    errors.push({
      taskId: task.id,
      classification: "MAJOR",
      rationale: "No matches made",
      detail: `No responses provided for "${task.title}".`,
    });
    return;
  }

  const correctMap = new Map(data.pairs.map((p) => [p.left.id, p.right.id]));
  let wrongCount = 0;

  for (const [leftId, rightId] of Object.entries(answer)) {
    const correctRightId = correctMap.get(leftId);
    if (correctRightId && correctRightId !== rightId) {
      wrongCount++;
      const leftItem = data.pairs.find((p) => p.left.id === leftId);
      errors.push({
        taskId: task.id,
        classification: wrongCount >= 2 ? "MAJOR" : "MINOR",
        rationale: wrongCount >= 2
          ? "Multiple incorrect matches indicate fundamental misunderstanding"
          : "Single incorrect match",
        detail: `Incorrectly matched: "${leftItem?.left.text ?? leftId}"`,
      });
    }
  }

  for (const [leftId] of correctMap) {
    if (!(leftId in answer)) {
      errors.push({
        taskId: task.id,
        classification: "MINOR",
        rationale: "Incomplete matching",
        detail: `Missing match for an item.`,
      });
    }
  }
}
