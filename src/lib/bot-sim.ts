import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { enqueue } from "@/lib/jobs";
import { applyScriptedTranscript } from "@/lib/stt/pipeline";

const SEQUENCE = [
  { from: "idle", to: "joining", delayMs: 1500 },
  { from: "joining", to: "waiting_for_host", delayMs: 3000 },
  { from: "waiting_for_host", to: "in_call", delayMs: 3000 },
  { from: "in_call", to: "leaving", delayMs: 6000 },
  { from: "leaving", to: "processing", delayMs: 2000 },
] as const;

export async function advanceBotSim(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) throw new Error("Meeting not found");

  const current = meeting.botState;
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

  await enqueue(meetingId, "bot_sim", {}, next.delayMs);
}
