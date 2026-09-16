import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sentences, speakers, summaries } from "@/db/schema";
import type { TranscriptLine } from "./client";
import { estimateTokens, groupIntoTurns, renderTurns, timecode } from "./chunking";

const WINDOW_BEFORE = 2;
const WINDOW_AFTER = 4;
const MAX_HITS = 28;

export type MeetingContext = {
  lines: TranscriptLine[];
  covered: "full" | "retrieved";
  summaryDigest: string | null;
};

async function speakerNames(meetingId: string) {
  const rows = await db.select().from(speakers).where(eq(speakers.meetingId, meetingId));
  return new Map(rows.map((s) => [s.speakerIndex, s.displayName ?? s.label]));
}

function toLines(
  rows: { index: number; speakerIndex: number; speakerName: string; startMs: number; text: string }[],
  names: Map<number, string>,
): TranscriptLine[] {
  return rows.map((r) => ({
    index: r.index,
    speakerName: names.get(r.speakerIndex) ?? r.speakerName,
    startMs: r.startMs,
    text: r.text,
  }));
}

export async function summaryDigest(meetingId: string) {
  const summary = await db.query.summaries.findFirst({
    where: eq(summaries.meetingId, meetingId),
  });
  if (!summary) return null;

  const parts: string[] = [];
  if (summary.gist) parts.push(summary.gist);
  if (summary.overview) parts.push(summary.overview);
  if (summary.outline.length) {
    parts.push(
      "Chapters:\n" +
        summary.outline.map((c) => `- ${timecode(c.startMs)} ${c.title}: ${c.summary}`).join("\n"),
    );
  }
  if (summary.actionItems.length) {
    parts.push(
      "Action items:\n" +
        summary.actionItems
          .map((a) => `- ${a.text}${a.assignee ? ` (${a.assignee})` : ""}`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

export async function buildMeetingContext(
  meetingId: string,
  question: string,
  budgetTokens: number,
): Promise<MeetingContext> {
  const names = await speakerNames(meetingId);

  const all = await db
    .select({
      index: sentences.index,
      speakerIndex: sentences.speakerIndex,
      speakerName: sentences.speakerName,
      startMs: sentences.startMs,
      text: sentences.text,
    })
    .from(sentences)
    .where(eq(sentences.meetingId, meetingId))
    .orderBy(asc(sentences.index));

  if (!all.length) return { lines: [], covered: "full", summaryDigest: null };

  const fullLines = toLines(all, names);
  const fullCost = estimateTokens(renderTurns(groupIntoTurns(fullLines)));
  if (fullCost <= budgetTokens) {
    return { lines: fullLines, covered: "full", summaryDigest: null };
  }

  const hits = await db.execute<{ index: number }>(sql`
    select s.index as "index"
    from sentences s
    where s.meeting_id = ${meetingId}
      and to_tsvector('english', s.text) @@ websearch_to_tsquery('english', ${question})
    order by ts_rank(to_tsvector('english', s.text), websearch_to_tsquery('english', ${question})) desc
    limit ${MAX_HITS}
  `);

  const anchors = (hits as unknown as { index: number }[]).map((h) => Number(h.index));

  const keep = new Set<number>();
  for (const anchor of anchors) {
    for (let i = anchor - WINDOW_BEFORE; i <= anchor + WINDOW_AFTER; i++) keep.add(i);
  }

  const stride = Math.max(1, Math.floor(all.length / 40));
  for (let i = 0; i < all.length; i += stride) keep.add(all[i].index);

  let selected = all.filter((r) => keep.has(r.index));
  let lines = toLines(selected, names);

  while (
    estimateTokens(renderTurns(groupIntoTurns(lines))) > budgetTokens &&
    selected.length > 20
  ) {
    selected = selected.filter((_, i) => i % 4 !== 3);
    lines = toLines(selected, names);
  }

  return { lines, covered: "retrieved", summaryDigest: await summaryDigest(meetingId) };
}

export async function buildWorkspaceContext(
  meetingIds: string[],
  question: string,
  budgetPerMeeting: number,
) {
  const out: { meetingId: string; lines: TranscriptLine[]; summaryDigest: string | null }[] = [];
  for (const meetingId of meetingIds) {
    const ctx = await buildMeetingContext(meetingId, question, budgetPerMeeting);
    out.push({ meetingId, lines: ctx.lines, summaryDigest: ctx.summaryDigest });
  }
  return out;
}

export async function meetingsMatching(workspaceId: string, question: string, limit: number) {
  const rows = await db.execute<{ meeting_id: string; score: number }>(sql`
    select s.meeting_id, sum(ts_rank(to_tsvector('english', s.text), websearch_to_tsquery('english', ${question}))) as score
    from sentences s
    join meetings m on m.id = s.meeting_id
    where m.workspace_id = ${workspaceId}
      and to_tsvector('english', s.text) @@ websearch_to_tsquery('english', ${question})
    group by s.meeting_id
    order by score desc
    limit ${limit}
  `);
  return (rows as unknown as { meeting_id: string }[]).map((r) => r.meeting_id);
}

export { inArray, and };
