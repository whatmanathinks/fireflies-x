import { env } from "@/lib/env";
import { renderTranscript, type TranscriptLine } from "./client";
import {
  chunkLines,
  chunkTurns,
  estimateTokens,
  groupIntoTurns,
  inputBudget,
  renderIndexed,
  renderTurns,
  timecode,
} from "./chunking";
import { activeProvider, generateJson } from "./provider";
import {
  chunkNotesSchema,
  classifySchema,
  summarySchema,
  type ChunkNotes,
  type ClassifyResult,
  type SummaryResult,
} from "./schemas";
import { templateById } from "./templates";

const MAP_OUTPUT_TOKENS = 1400;
const CLASSIFY_OUTPUT_TOKENS = 1800;

const SUMMARY_SYSTEM = `You write meeting notes for a meeting-intelligence product. Your notes are read by people who did not attend.

Rules that matter more than anything else:
- Only state what was actually said. Never infer a decision that was not made, and never invent an owner for an unowned task.
- Prefer the specific over the general. "P95 latency dropped from 1100ms to 340ms" is useful; "performance improved" is not.
- Preserve numbers, dates, names, and dollar figures exactly as spoken.
- When something was explicitly left undecided, say so rather than implying resolution.
- Write in plain prose. No markdown, no bold, no headings inside field values.
- Sentence indices you cite must exist in the transcript you were given.`;

const MAP_SYSTEM = `${SUMMARY_SYSTEM}

You are reading ONE SECTION of a longer meeting, not the whole thing. Summarise only this section. Do not speculate about what came before or after.`;

const REDUCE_SYSTEM = `${SUMMARY_SYSTEM}

You are given ordered section notes from a single long meeting. Merge them into one coherent set of notes for the whole meeting.
- Deduplicate: the same commitment or point may appear in several sections.
- Keep chronological order for the outline, and keep the sentence indices you were given.
- The overview must read as one meeting, not as a list of sections.`;

const CLASSIFY_SYSTEM = `You label individual sentences of a meeting transcript so they can be filtered in a UI.

Return only sentence indices that genuinely belong to each category. Precision matters far more than recall - a wrong label is worse than a missing one.

- tasks: someone commits to do something, or assigns work. Not mere discussion of work.
- questions: a genuine question seeking information. Not rhetorical filler like "right?" or "you know?".
- metrics: contains an actual measurement, count, percentage, or quantified outcome.
- pricing: price, cost, budget, margin, revenue, or contract value.
- dates: a specific date, deadline, month, or scheduled time. Not vague words like "soon" or "later".
- positive / negative: only sentences carrying clear sentiment. Most sentences are neutral and should appear in neither list.

Only use indices that appear in the excerpt you were given.`;

function brevityGuidance() {
  const constrained = activeProvider() === "openai-compatible" && env.llmMaxTokens < 6000;
  if (!constrained) return "";
  return `\n\nOutput budget is tight. Keep within these limits without dropping specifics:
- overview: 2 to 4 short paragraphs
- shorthand_bullet: at most 10 entries
- outline: 4 to 7 chapters, one-sentence summaries
- bullet_gist: at most 5 entries
- keywords: at most 8
Specific numbers, names and dates still matter more than prose.`;
}

export type ProgressFn = (note: string | null) => Promise<void> | void;

export async function generateSummary(
  lines: TranscriptLine[],
  templateId: string,
  meetingTitle: string,
  onProgress?: ProgressFn,
): Promise<SummaryResult> {
  const template = templateById(templateId);
  const turns = groupIntoTurns(lines);
  const rendered = renderTurns(turns);
  const budget = inputBudget(env.llmMaxTokens);

  if (estimateTokens(rendered) <= budget) {
    return generateJson(
      summarySchema,
      "meeting_notes",
      `${SUMMARY_SYSTEM}\n\nTemplate guidance:\n${template.guidance}${brevityGuidance()}`,
      [
        {
          text: `Meeting title: ${meetingTitle}\n\nTranscript. Each line is "#startIndex mm:ss Speaker: text":\n\n${rendered}`,
          cache: true,
        },
        { text: "Write the meeting notes." },
      ],
    );
  }

  const chunks = chunkTurns(turns, inputBudget(MAP_OUTPUT_TOKENS));
  const sections: ChunkNotes[] = [];

  for (let i = 0; i < chunks.length; i++) {
    await onProgress?.(`Reading section ${i + 1} of ${chunks.length}`);
    const chunk = chunks[i];
    const span = `${timecode(chunk[0].startMs)}–${timecode(chunk[chunk.length - 1].startMs)}`;
    const notes = await generateJson(
      chunkNotesSchema,
      "section_notes",
      `${MAP_SYSTEM}\n\nTemplate guidance:\n${template.guidance}`,
      [
        {
          text: `Meeting: ${meetingTitle}\nSection ${i + 1} of ${chunks.length} (${span})\n\nEach line is "#startIndex mm:ss Speaker: text":\n\n${renderTurns(chunk)}`,
        },
        { text: "Summarise this section." },
      ],
      MAP_OUTPUT_TOKENS,
    );
    sections.push(notes);
  }

  const digest = sections
    .map((section, i) => {
      const chunk = chunks[i];
      const span = `${timecode(chunk[0].startMs)}–${timecode(chunk[chunk.length - 1].startMs)}`;
      const parts = [
        `### Section ${i + 1} (${span})`,
        section.headline,
        ...section.key_points.map((p) => `- ${p}`),
      ];
      if (section.chapters.length) {
        parts.push(
          ...section.chapters.map(
            (c) => `chapter: #${c.start_sentence_index} ${c.title} — ${c.summary}`,
          ),
        );
      }
      if (section.action_items.length) {
        parts.push(
          ...section.action_items.map(
            (a) =>
              `action: ${a.text} | owner=${a.assignee ?? "-"} | due=${a.due_date ?? "-"} | #${a.sentence_index ?? "-"}`,
          ),
        );
      }
      if (section.keywords.length) parts.push(`keywords: ${section.keywords.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n\n");

  await onProgress?.("Merging sections into final notes");

  return generateJson(
    summarySchema,
    "meeting_notes",
    `${REDUCE_SYSTEM}\n\nTemplate guidance:\n${template.guidance}${brevityGuidance()}`,
    [
      {
        text: `Meeting title: ${meetingTitle}\nThe meeting ran ${timecode(lines[lines.length - 1]?.startMs ?? 0)} and was read in ${chunks.length} sections.\n\n${digest}`,
      },
      { text: "Merge these sections into notes for the whole meeting." },
    ],
  );
}

export async function classifySentences(
  lines: TranscriptLine[],
  onProgress?: ProgressFn,
): Promise<ClassifyResult> {
  const budget = inputBudget(CLASSIFY_OUTPUT_TOKENS);
  const chunks = chunkLines(lines, budget);

  const merged: ClassifyResult = {
    tasks: [],
    questions: [],
    metrics: [],
    pricing: [],
    dates: [],
    positive: [],
    negative: [],
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunks.length > 1) {
      await onProgress?.(`Labelling transcript, part ${i + 1} of ${chunks.length}`);
    }
    const result = await generateJson(classifySchema, "sentence_labels", CLASSIFY_SYSTEM, [
      {
        text: `Transcript excerpt. Lines are "index text", with speaker headers between them:\n\n${renderIndexed(chunk)}`,
      },
      { text: "Label the sentences." },
    ], CLASSIFY_OUTPUT_TOKENS);

    for (const key of Object.keys(merged) as (keyof ClassifyResult)[]) {
      merged[key].push(...(result[key] ?? []));
    }
  }

  return merged;
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

export { renderTranscript };
