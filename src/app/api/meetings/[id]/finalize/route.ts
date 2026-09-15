import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { meetings, sentences } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { hasDeepgram } from "@/lib/env";
import { enqueue, runDueJobs } from "@/lib/jobs";
import { applyScriptedTranscript } from "@/lib/stt/pipeline";

export const maxDuration = 300;

const bodySchema = z.object({
  audioUrl: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  durationMs: z.number().int().min(0),
  title: z.string().min(1).max(200).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid body");

  return handle(async () => {
    const session = await requireSession();

    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)),
    });
    if (!meeting) throw new Error("Meeting not found");

    await db
      .update(meetings)
      .set({
        audioUrl: parsed.data.audioUrl ?? meeting.audioUrl,
        mimeType: parsed.data.mimeType ?? meeting.mimeType,
        durationMs: parsed.data.durationMs || meeting.durationMs,
        title: parsed.data.title ?? meeting.title,
        isLive: false,
        status: "transcribing",
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id));

    const captured = await db
      .select({ index: sentences.index })
      .from(sentences)
      .where(eq(sentences.meetingId, id))
      .limit(1);

    const audioUrl = parsed.data.audioUrl ?? meeting.audioUrl;

    if (captured.length > 0) {
      await enqueue(id, "summarize");
    } else if (audioUrl && hasDeepgram()) {
      await enqueue(id, "transcribe");
    } else {
      await applyScriptedTranscript(id);
      await enqueue(id, "summarize");
    }

    after(() => runDueJobs(4));

    return { status: "queued" };
  });
}
