import { env } from "@/lib/env";
import { renderTranscript, type TranscriptLine } from "./client";
import { generateJson, activeProvider } from "./provider";
import { classifySchema, summarySchema, type ClassifyResult, type SummaryResult } from "./schemas";
import { templateById } from "./templates";

const SUMMARY_SYSTEM = `You write meeting notes for a meeting-intelligence product. Your notes are read by people who did not attend.

Rules that matter more than anything else:
- Only state what was actually said. Never infer a decision that was not made, and never invent an owner for an unowned task.
- Prefer the specific over the general. "P95 latency dropped from 1100ms to 340ms" is useful; "performance improved" is not.
- Preserve numbers, dates, names, and dollar figures exactly as spoken.
- When something was explicitly left undecided, say so rather than implying resolution.
- Write in plain prose. No markdown, no bold, no headings inside field values.
- Sentence indices you cite must exist in the transcript you were given.`;

const CLASSIFY_SYSTEM = `You label individual sentences of a meeting transcript so they can be filtered in a UI.

Return only sentence indices that genuinely belong to each category. Precision matters far more than recall - a wrong label is worse than a missing one.

- tasks: someone commits to do something, or assigns work. Not mere discussion of work.
- questions: a genuine question seeking information. Not rhetorical filler like "right?" or "you know?".
- metrics: contains an actual measurement, count, percentage, or quantified outcome.
- pricing: price, cost, budget, margin, revenue, or contract value.
- dates: a specific date, deadline, month, or scheduled time. Not vague words like "soon" or "later".
- positive / negative: only sentences carrying clear sentiment. Most sentences are neutral and should appear in neither list.`;

function brevityGuidance() {
  const constrained =
    activeProvider() === "openai-compatible" && env.llmMaxTokens < 6000;
  if (!constrained) return "";
  return `\n\nOutput budget is tight. Keep within these limits without dropping specifics:
- overview: 2 to 3 short paragraphs
- shorthand_bullet: at most 8 entries
- outline: 3 to 5 chapters, one-sentence summaries
- bullet_gist: at most 4 entries
- keywords: at most 8
Specific numbers, names and dates still matter more than prose.`;
}

export async function generateSummary(
  lines: TranscriptLine[],
  templateId: string,
  meetingTitle: string,
): Promise<SummaryResult> {
  const template = templateById(templateId);
  const transcript = renderTranscript(lines);

  return generateJson(
    summarySchema,
    "meeting_notes",
    `${SUMMARY_SYSTEM}\n\nTemplate guidance:\n${template.guidance}${brevityGuidance()}`,
    [
      {
        text: `Meeting title: ${meetingTitle}\n\nTranscript (each line is [index] (mm:ss) Speaker: text):\n\n${transcript}`,
        cache: true,
      },
      { text: "Write the meeting notes." },
    ],
  );
}

export async function classifySentences(
  lines: TranscriptLine[],
): Promise<ClassifyResult> {
  const transcript = renderTranscript(lines);

  return generateJson(classifySchema, "sentence_labels", CLASSIFY_SYSTEM, [
    {
      text: `Transcript (each line is [index] (mm:ss) Speaker: text):\n\n${transcript}`,
      cache: true,
    },
    { text: "Label the sentences." },
  ]);
}

export function toAiFilters(result: ClassifyResult, count: number) {
  const set = (arr: number[]) => new Set(arr.filter((i) => i >= 0 && i < count));
  const tasks = set(result.tasks);
  const questions = set(result.questions);
  const metrics = set(result.metrics);
  const pricing = set(result.pricing);
  const dates = set(result.dates);
  const positive = set(result.positive);
  const negative = set(result.negative);

  return Array.from({ length: count }, (_, i) => ({
    task: tasks.has(i),
    question: questions.has(i),
    metric: metrics.has(i),
    pricing: pricing.has(i),
    date_and_time: dates.has(i),
    sentiment: negative.has(i)
      ? ("negative" as const)
      : positive.has(i)
        ? ("positive" as const)
        : ("neutral" as const),
  }));
}
