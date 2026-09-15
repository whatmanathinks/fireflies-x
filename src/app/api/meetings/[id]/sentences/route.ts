import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings, sentences, speakers } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const bodySchema = z.object({
  sentences: z
    .array(
      z.object({
        speakerIndex: z.number().int().min(0),
        text: z.string().min(1),
        startMs: z.number().int().min(0),
        endMs: z.number().int().min(0),
        words: z
          .array(z.object({ w: z.string(), s: z.number(), e: z.number() }))
          .default([]),
      }),
    )
    .min(1)
    .max(200),
  durationMs: z.number().int().min(0).optional(),
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

    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${sentences.index}), -1) + 1` })
      .from(sentences)
      .where(eq(sentences.meetingId, id));

    const existingSpeakers = await db
      .select({ speakerIndex: speakers.speakerIndex })
      .from(speakers)
      .where(eq(speakers.meetingId, id));
    const known = new Set(existingSpeakers.map((s) => s.speakerIndex));

    const incoming = [...new Set(parsed.data.sentences.map((s) => s.speakerIndex))].filter(
      (i) => !known.has(i),
    );
    if (incoming.length) {
      await db
        .insert(speakers)
        .values(
          incoming.map((idx) => ({
            meetingId: id,
            speakerIndex: idx,
            label: `Speaker ${idx + 1}`,
          })),
        )
        .onConflictDoNothing();
    }

    let cursor = Number(next);
    await db.insert(sentences).values(
      parsed.data.sentences.map((s) => ({
        meetingId: id,
        index: cursor++,
        speakerIndex: s.speakerIndex,
        speakerName: `Speaker ${s.speakerIndex + 1}`,
        text: s.text,
        rawText: s.text.toLowerCase().replace(/[.,!?]/g, ""),
        startMs: s.startMs,
        endMs: s.endMs,
        words: s.words,
      })),
    );

    if (parsed.data.durationMs) {
      await db
        .update(meetings)
        .set({ durationMs: parsed.data.durationMs, updatedAt: new Date() })
        .where(eq(meetings.id, id));
    }

    return { appended: parsed.data.sentences.length, nextIndex: cursor };
  });
}
