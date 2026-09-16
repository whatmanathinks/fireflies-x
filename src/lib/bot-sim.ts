import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { hasRecall } from "@/lib/env";
import { enqueue } from "@/lib/jobs";
import { applyScriptedTranscript } from "@/lib/stt/pipeline";
import {
  audioDownloadUrl,
  everRecorded,
  getBot,
  latestStatus,
  mapBotState,
  wasAdmitted,
} from "@/lib/bot/recall";

const SEQUENCE = [
  { from: "idle", to: "joining", delayMs: 1500 },
  { from: "joining", to: "waiting_for_host", delayMs: 3000 },
  { from: "waiting_for_host", to: "in_call", delayMs: 3000 },
  { from: "in_call", to: "leaving", delayMs: 6000 },
  { from: "leaving", to: "processing", delayMs: 2000 },
] as const;

const POLL_FAST_MS = 4000;
const POLL_SLOW_MS = 15000;

function pollDelayFor(code: string | undefined) {
  return code === "in_call_recording" || code === "in_call_not_recording"
    ? POLL_SLOW_MS
    : POLL_FAST_MS;
}
const MAX_POLL_MS = 4 * 60 * 60 * 1000;

export async function advanceBot(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) throw new Error("Meeting not found");

  if (meeting.recallBotId && hasRecall()) {
    return pollRecallBot(meetingId, meeting.recallBotId, meeting.createdAt);
  }
  return advanceSimulation(meetingId, meeting.botState);
}

async function failMeeting(meetingId: string, reason: string) {
  await db
    .update(meetings)
    .set({
      botState: "failed",
      isLive: false,
      status: "failed",
      failureReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(meetings.id, meetingId));
}

async function pollRecallBot(meetingId: string, botId: string, createdAt: Date) {
  const bot = await getBot(botId);
  const status = latestStatus(bot);
  const code = status?.code?.replace(/^bot\./, "");
  const nextState = mapBotState(code) as typeof meetings.$inferInsert.botState;

  if (code === "fatal" || code === "recording_permission_denied") {
    await failMeeting(
      meetingId,
      status?.message ??
        (code === "recording_permission_denied"
          ? "The host denied the notetaker permission to record."
          : "The notetaker could not join this call."),
    );
    return;
  }

  if (code === "done" || code === "call_ended") {
    const audioUrl = audioDownloadUrl(bot);

    if (!audioUrl && code === "done" && !everRecorded(bot)) {
      await failMeeting(
        meetingId,
        wasAdmitted(bot)
          ? "The notetaker joined but never started recording, so there is nothing to transcribe."
          : "The notetaker was never admitted to the call. Let it in from the waiting room next time.",
      );
      return;
    }

    if (!audioUrl) {
      const waitedMs = Date.now() - createdAt.getTime();
      if (code === "done" && waitedMs > MAX_POLL_MS) {
        await failMeeting(meetingId, "Timed out waiting for the recording to be processed.");
        return;
      }
      await db
        .update(meetings)
        .set({
          botState: code === "done" ? "processing" : "leaving",
          isLive: false,
          status: "transcribing",
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, meetingId));
      await enqueue(meetingId, "bot", {}, POLL_FAST_MS);
      return;
    }

    await db
      .update(meetings)
      .set({
        botState: "done",
        isLive: false,
        status: "transcribing",
        audioUrl,
        mimeType: "audio/mpeg",
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    await enqueue(meetingId, "transcribe");
    return;
  }

  await db
    .update(meetings)
    .set({
      botState: nextState,
      isLive: code === "in_call_recording",
      status: code === "call_ended" ? "transcribing" : "recording",
      updatedAt: new Date(),
    })
    .where(eq(meetings.id, meetingId));

  if (Date.now() - createdAt.getTime() > MAX_POLL_MS) {
    await db
      .update(meetings)
      .set({ botState: "failed", isLive: false, status: "failed", failureReason: "Notetaker timed out." })
      .where(eq(meetings.id, meetingId));
    return;
  }

  await enqueue(meetingId, "bot", {}, pollDelayFor(code));
}

async function advanceSimulation(meetingId: string, current: string) {
  const next = SEQUENCE.find((s) => s.from === current);

  if (!next) {
    if (current === "processing") {
      await applyScriptedTranscript(meetingId);
      await db
        .update(meetings)
        .set({ botState: "done", isLive: false, status: "transcribing" })
        .where(eq(meetings.id, meetingId));
      await enqueue(meetingId, "summarize");
    }
    return;
  }

  await db
    .update(meetings)
    .set({
      botState: next.to,
      isLive: next.to === "in_call",
      status: next.to === "processing" ? "transcribing" : "recording",
      updatedAt: new Date(),
    })
    .where(eq(meetings.id, meetingId));

  await enqueue(meetingId, "bot", {}, next.delayMs);
}
