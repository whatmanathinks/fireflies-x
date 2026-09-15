import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, meetings } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const bodySchema = z.object({
  body: z.string().min(1).max(4000),
  timeMs: z.number().int().min(0).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid body");

  return handle(async () => {
    const session = await requireSession();
    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)),
    });
    if (!meeting) throw new Error("Meeting not found");

    const [comment] = await db
      .insert(comments)
      .values({
        meetingId: id,
        parentId: parsed.data.parentId ?? null,
        authorId: session.userId,
        authorName: session.name,
        body: parsed.data.body,
        timeMs: parsed.data.timeMs ?? null,
      })
      .returning();
    return comment;
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const commentId = new URL(request.url).searchParams.get("commentId");
  if (!commentId) return fail("commentId is required");

  return handle(async () => {
    const session = await requireSession();
    await db
      .delete(comments)
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.meetingId, id),
          eq(comments.authorId, session.userId),
        ),
      );
    return { ok: true };
  });
}
