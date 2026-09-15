import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { hasRecall } from "@/lib/env";
import { enqueue } from "@/lib/jobs";
import { applyScriptedTranscript } from "@/lib/stt/pipeline";
import {
  audioDownloadUrl,
  getBot,
  latestStatus,
  mapBotState,
  TERMINAL_CODES,
} from "@/lib/bot/recall";

const SEQUENCE = [
  { from: "idle", to: "joining", delayMs: 1500 },
  { from: "joining", to: "waiting_for_host", delayMs: 3000 },
  { from: "waiting_for_host", to: "in_call", delayMs: 3000 },
  { from: "in_call", to: "leaving", delayMs: 6000 },
  { from: "leaving", to: "processing", delayMs: 2000 },
] as const;

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 4 * 60 * 60 * 1000;

export async function advanceBot(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) throw new Error("Meeting not found");

  if (meeting.recallBotId && hasRecall()) {
    return pollRecallBot(meetingId, meeting.recallBotId, meeting.createdAt);
  }
  return advanceSimulation(meetingId, meeting.botState);
}

async function pollRecallBot(meetingId: string, botId: string, createdAt: Date) {
  const bot = await getBot(botId);
  const status = latestStatus(bot);
  const code = status?.code?.replace(/^bot\./, "");
  const nextState = mapBotState(code) as typeof meetings.$inferInsert.botState;

  if (code === "fatal" || code === "recording_permission_denied") {
    await db
      .update(meetings)
      .set({
        botState: "failed",
        isLive: false,
        status: "failed",
        failureReason:
          status?.message ??
          (code === "recording_permission_denied"
            ? "The host denied the notetaker permission to record."
            : "The notetaker could not join this call."),
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));
    return;
  }

  if (code === "done") {
    const audioUrl = audioDownloadUrl(bot);
    if (!audioUrl) {
      await db
        .update(meetings)
        .set({ botState: "processing", isLive: false, updatedAt: new Date() })
        .where(eq(meetings.id, meetingId));
      await enqueue(meetingId, "bot", {}, POLL_INTERVAL_MS);
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

  await enqueue(meetingId, "bot", {}, POLL_INTERVAL_MS);
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
