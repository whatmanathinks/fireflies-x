import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, sentences, summaries } from "@/db/schema";
import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { getMeeting } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(async () => {
    const session = await requireSession();
    const meeting = await getMeeting(id, session.workspaceId);
    if (!meeting) throw new Error("Meeting not found");

    const [rows, jobRows, summary] = await Promise.all([
      db.select().from(sentences).where(eq(sentences.meetingId, id)).orderBy(asc(sentences.index)),
      db.select().from(jobs).where(eq(jobs.meetingId, id)),
      db.query.summaries.findFirst({ where: eq(summaries.meetingId, id) }),
    ]);

    return {
      status: meeting.status,
      botState: meeting.botState,
      recallBotId: meeting.recallBotId,
      failureReason: meeting.failureReason,
      durationMs: meeting.durationMs,
      sentences: rows.length,
      jobs: jobRows.map((j) => ({ step: j.step, status: j.status, attempts: j.attempts, error: j.lastError })),
      lines: rows.map((r) => ({ speakerName: r.speakerName, text: r.text, startMs: r.startMs })),
      summary,
    };
  });
}
