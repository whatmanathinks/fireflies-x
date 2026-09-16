import { z } from "zod";

export const summarySchema = z.object({
  gist: z
    .string()
    .describe("A single sentence, under 15 words, naming what this meeting was about."),
  short_summary: z
    .string()
    .describe("Two to three sentences a busy executive could read instead of attending."),
  overview: z
    .string()
    .describe(
      "Three to six short paragraphs covering what was discussed, what was decided, and what remains open. Plain prose, no bullet points, no markdown headings.",
    ),
  keywords: z
    .array(z.string())
    .describe("Six to twelve distinctive topic keywords or phrases, title case, no generic words like 'meeting' or 'discussion'."),
  topics_discussed: z
    .array(z.string())
    .describe("Four to eight topic labels, each two to four words."),
  meeting_type: z
    .string()
    .describe("A short label for the kind of meeting, e.g. 'Product Planning', 'Sales Discovery', 'One-on-One'."),
  bullet_gist: z
    .array(z.string())
    .describe("Three to six one-line takeaways. Each must carry a specific fact, number, or decision - never a vague summary line."),
  shorthand_bullet: z
    .array(z.string())
    .describe(
      "Eight to sixteen terse notes in the style of hand-written meeting shorthand. Include concrete numbers and names where they were said.",
    ),
  outline: z
    .array(
      z.object({
        title: z.string().describe("Chapter title, two to six words."),
        start_sentence_index: z
          .number()
          .int()
          .describe("Index of the sentence where this chapter begins."),
        summary: z.string().describe("One or two sentences on what this chapter covers."),
      }),
    )
    .describe("Chronological chapters covering the whole meeting. Between three and nine of them."),
  action_items: z
    .array(
      z.object({
        text: z.string().describe("The commitment, phrased as an imperative task."),
        assignee: z
          .string()
          .nullable()
          .describe("Speaker name who owns it, or null if genuinely unassigned."),
        due_date: z
          .string()
          .nullable()
          .describe("Due date exactly as spoken, e.g. 'September 26' or 'Friday'. Null if none was stated."),
        sentence_index: z
          .number()
          .int()
          .nullable()
          .describe("Index of the sentence where this was committed to."),
      }),
    )
    .describe("Every explicit commitment made. Do not invent action items that were not agreed to."),
});

export type SummaryResult = z.infer<typeof summarySchema>;

export const chunkNotesSchema = z.object({
  headline: z.string().describe("One sentence naming what this section of the meeting covered."),
  key_points: z
    .array(z.string())
    .describe("Two to five specific points from this section. Keep numbers, names and dates exactly as spoken."),
  chapters: z
    .array(
      z.object({
        title: z.string().describe("Chapter title, two to six words."),
        start_sentence_index: z.number().int().describe("Index marking where this chapter begins."),
        summary: z.string().describe("One sentence on what this chapter covers."),
      }),
    )
    .describe("One to three chapters covering this section."),
  action_items: z
    .array(
      z.object({
        text: z.string().describe("The commitment, phrased as an imperative task."),
        assignee: z.string().nullable(),
        due_date: z.string().nullable(),
        sentence_index: z.number().int().nullable(),
      }),
    )
    .describe("Explicit commitments made in this section. Empty array if none."),
  keywords: z.array(z.string()).describe("Up to five distinctive topic keywords from this section."),
});

export type ChunkNotes = z.infer<typeof chunkNotesSchema>;

export const classifySchema = z.object({
  tasks: z.array(z.number().int()).describe("Sentence indices that state a commitment, assignment, or to-do."),
  questions: z.array(z.number().int()).describe("Sentence indices that ask a genuine question."),
  metrics: z
    .array(z.number().int())
    .describe("Sentence indices containing a measurement, percentage, count, or quantified result."),
  pricing: z
    .array(z.number().int())
    .describe("Sentence indices discussing price, cost, budget, revenue, margin, or contract value."),
  dates: z
    .array(z.number().int())
    .describe("Sentence indices referring to a specific date, deadline, or scheduled time."),
  positive: z.array(z.number().int()).describe("Sentence indices with clearly positive sentiment."),
  negative: z
    .array(z.number().int())
    .describe("Sentence indices with clearly negative sentiment: concern, frustration, risk, or bad news."),
});

export type ClassifyResult = z.infer<typeof classifySchema>;

export const digestSchema = z.object({
  headline: z.string().describe("One line naming the most important thing across these meetings."),
  items: z
    .array(
      z.object({
        title: z.string().describe("Short label, three to six words."),
        detail: z.string().describe("One or two sentences with the specific fact."),
        meeting_id: z.string().describe("The id of the meeting this came from."),
      }),
    )
    .describe("Three to five items worth knowing, ordered by importance."),
});
