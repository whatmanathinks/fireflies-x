import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings, sentences, speakers } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const patchSchema = z.union([
  z.object({ sentenceId: z.string().uuid(), text: z.string().min(1).max(5000) }),
  z.object({ speakerIndex: z.number().int().min(0), displayName: z.string().min(1).max(80) }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid body");

  return handle(async () => {
    const session = await requireSession();
    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)),
    });
    if (!meeting) throw new Error("Meeting not found");

    if ("sentenceId" in parsed.data) {
      await db
        .update(sentences)
        .set({
          text: parsed.data.text,
          rawText: parsed.data.text.toLowerCase().replace(/[.,!?]/g, ""),
          edited: true,
        })
        .where(and(eq(sentences.id, parsed.data.sentenceId), eq(sentences.meetingId, id)));
      return { ok: true };
    }

    await db
      .update(speakers)
      .set({ displayName: parsed.data.displayName })
      .where(
        and(eq(speakers.meetingId, id), eq(speakers.speakerIndex, parsed.data.speakerIndex)),
      );

    await db
      .update(sentences)
      .set({ speakerName: parsed.data.displayName })
      .where(
        and(eq(sentences.meetingId, id), eq(sentences.speakerIndex, parsed.data.speakerIndex)),
      );

    return { ok: true };
  });
}
