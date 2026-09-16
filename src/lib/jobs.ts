import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  jobs,
  meetingAnalytics,
  meetings,
  sentences as sentencesTable,
  speakers as speakersTable,
  summaries,
  tasks,
} from "@/db/schema";
import { heuristicClassify, heuristicSummary } from "@/lib/ai/fallback";
import { classifySentences, generateSummary, toAiFilters } from "@/lib/ai/summarize";
import { computeAnalytics } from "@/lib/analytics";
import { env, hasAnthropic } from "@/lib/env";
import { failureCodeOf, isPermanent, PermanentError } from "@/lib/errors";

export type JobStep = "summarize" | "transcribe" | "bot";

const MAX_ATTEMPTS = 3;
const STALE_MS = Number(process.env.JOB_STALE_MS ?? 20 * 60 * 1000);

/** Starts the chaining job runner so delayed work (bot polling) keeps advancing. */
export async function triggerJobRunner(limit = 4) {
  try {
    await fetch(
      `${env.publicBaseUrl}/api/jobs/run?secret=${env.internalSecret}&limit=${limit}`,
      { method: "POST" },
    );
  } catch {
    await runDueJobs(limit);
  }
}

export async function setProgress(meetingId: string, note: string | null) {
  await db.update(meetings).set({ progressNote: note }).where(eq(meetings.id, meetingId));
}

export async function enqueue(
  meetingId: string,
  step: JobStep,
  payload?: Record<string, unknown>,
  delayMs = 0,
) {
  const runAfter = new Date(Date.now() + delayMs);
  await db
    .insert(jobs)
    .values({ meetingId, step, payload, runAfter, status: "queued" })
    .onConflictDoUpdate({
      target: [jobs.meetingId, jobs.step],
      set: {
        status: "queued",
        runAfter,
        payload: payload ?? null,
        attempts: 0,
        lastError: null,
        startedAt: null,
        finishedAt: null,
      },
    });
}

async function claimJobs(limit: number) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        lte(jobs.runAfter, new Date()),
        or(
          eq(jobs.status, "queued"),
          and(eq(jobs.status, "running"), lt(jobs.startedAt, staleBefore)),
        ),
        lt(jobs.attempts, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(jobs.runAfter))
    .limit(limit);

  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  return db
    .update(jobs)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: sql`${jobs.attempts} + 1`,
    })
    .where(inArray(jobs.id, ids))
    .returning();
}

export async function hasDueWork() {
  const ms = await nextDueInMs();
  return ms !== null && ms <= 0;
}

/** ms until the next queued job is runnable. Negative means overdue, null means nothing queued. */
export async function nextDueInMs() {
  const [row] = await db
    .select({ runAfter: jobs.runAfter })
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), lt(jobs.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(jobs.runAfter))
    .limit(1);
  return row ? row.runAfter.getTime() - Date.now() : null;
}

export async function runDueJobs(limit = 3) {
  const results: { step: string; meetingId: string; ok: boolean; error?: string }[] = [];

  for (let processed = 0; processed < limit; processed++) {
    const [job] = await claimJobs(1);
    if (!job) break;

    try {
      await runStep(job.step as JobStep, job.meetingId, job.payload ?? {});
      await db
        .update(jobs)
        .set({ status: "completed", finishedAt: new Date(), lastError: null })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, "running")));
      results.push({ step: job.step, meetingId: job.meetingId, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = isPermanent(error);
      const exhausted = permanent || job.attempts >= MAX_ATTEMPTS;
      await db
        .update(jobs)
        .set({
          status: exhausted ? "failed" : "queued",
          lastError: message.slice(0, 2000),
          finishedAt: exhausted ? new Date() : null,
          runAfter: new Date(Date.now() + 15_000 * job.attempts),
        })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, "running")));
      if (exhausted) {
        await db
          .update(meetings)
          .set({ status: "failed", failureReason: message.slice(0, 500) })
          .where(eq(meetings.id, job.meetingId));
      }
      results.push({ step: job.step, meetingId: job.meetingId, ok: false, error: message });
    }
  }

  return results;
}

async function runStep(
  step: JobStep,
  meetingId: string,
  payload: Record<string, unknown>,
) {
  if (step === "summarize") return summarizeMeeting(meetingId, payload);
  if (step === "bot") {
    const { advanceBot } = await import("@/lib/bot-sim");
    return advanceBot(meetingId);
  }
  if (step === "transcribe") {
    const { runTranscription } = await import("@/lib/stt/pipeline");
    return runTranscription(meetingId);
  }
  throw new Error(`Unknown job step: ${step}`);
}

export async function summarizeMeeting(
  meetingId: string,
  payload: Record<string, unknown> = {},
) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) throw new Error("Meeting not found");

  const rows = await db
    .select()
    .from(sentencesTable)
    .where(eq(sentencesTable.meetingId, meetingId))
    .orderBy(asc(sentencesTable.index));

  if (rows.length === 0) {
    throw new PermanentError(
      "No speech was detected in this audio, so there is nothing to transcribe.",
      "no_speech",
    );
  }

  await db.update(meetings).set({ status: "summarizing" }).where(eq(meetings.id, meetingId));

  const speakerRows = await db
    .select()
    .from(speakersTable)
    .where(eq(speakersTable.meetingId, meetingId));

  const nameFor = new Map(
    speakerRows.map((s) => [s.speakerIndex, s.displayName ?? s.label]),
  );

  const lines = rows.map((s) => ({
    index: s.index,
    speakerName: nameFor.get(s.speakerIndex) ?? s.speakerName,
    startMs: s.startMs,
    text: s.text,
  }));

  const templateId = typeof payload.template === "string" ? payload.template : "general";

  const useAi = hasAnthropic();
  const progress = (note: string | null) => setProgress(meetingId, note);

  const classified = useAi
    ? await classifySentences(lines, progress)
    : heuristicClassify(lines);
  const filters = toAiFilters(classified, rows.length);

  for (const row of rows) {
    const next = filters[row.index];
    if (!next) continue;
    await db
      .update(sentencesTable)
      .set({ aiFilters: next })
      .where(eq(sentencesTable.id, row.id));
  }

  const summary = useAi
    ? await generateSummary(lines, templateId, meeting.title, progress)
    : heuristicSummary(lines, classified, meeting.title, "Meeting");

  const indexToMs = new Map(rows.map((s) => [s.index, s.startMs]));

  const summaryValues = {
    template: templateId,
    keywords: summary.keywords,
    actionItems: summary.action_items.map((a) => ({
      text: a.text,
      assignee: a.assignee,
      dueDate: a.due_date,
      sentenceIndex: a.sentence_index,
    })),
    outline: summary.outline.map((c) => ({
      title: c.title,
      startMs: indexToMs.get(c.start_sentence_index) ?? 0,
      summary: c.summary,
    })),
    shorthandBullet: summary.shorthand_bullet,
    overview: summary.overview,
    bulletGist: summary.bullet_gist,
    gist: summary.gist,
    shortSummary: summary.short_summary,
    meetingType: summary.meeting_type,
    topicsDiscussed: summary.topics_discussed,
    generatedAt: new Date(),
  };

  await db
    .insert(summaries)
    .values({ meetingId, ...summaryValues })
    .onConflictDoUpdate({ target: summaries.meetingId, set: summaryValues });

  const analytics = computeAnalytics(
    rows.map((s) => ({
      index: s.index,
      speakerIndex: s.speakerIndex,
      speakerName: nameFor.get(s.speakerIndex) ?? s.speakerName,
      text: s.text,
      startMs: s.startMs,
      endMs: s.endMs,
      words: s.words,
      aiFilters: filters[s.index] ?? null,
    })),
    nameFor,
    meeting.durationMs,
  );

  await db
    .insert(meetingAnalytics)
    .values({ meetingId, ...analytics, computedAt: new Date() })
    .onConflictDoUpdate({
      target: meetingAnalytics.meetingId,
      set: { ...analytics, computedAt: new Date() },
    });

  await db.delete(tasks).where(eq(tasks.meetingId, meetingId));
  if (summary.action_items.length) {
    await db.insert(tasks).values(
      summary.action_items.map((a) => ({
        workspaceId: meeting.workspaceId,
        meetingId,
        text: a.text,
        assignee: a.assignee,
        dueDate: a.due_date,
        sentenceIndex: a.sentence_index,
      })),
    );
  }

  await db
    .update(meetings)
    .set({
      status: "completed",
      isLive: false,
      updatedAt: new Date(),
      failureReason: null,
      progressNote: null,
    })
    .where(eq(meetings.id, meetingId));
}
