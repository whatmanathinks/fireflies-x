import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookmarks } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const bodySchema = z.object({
  label: z.string().min(1).max(200),
  timeMs: z.number().int().min(0),
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
    const [bookmark] = await db
      .insert(bookmarks)
      .values({
        meetingId: id,
        userId: session.userId,
        label: parsed.data.label,
        timeMs: parsed.data.timeMs,
      })
      .returning();
    return bookmark;
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bookmarkId = new URL(request.url).searchParams.get("bookmarkId");
  if (!bookmarkId) return fail("bookmarkId is required");

  return handle(async () => {
    const session = await requireSession();
    await db
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.id, bookmarkId),
          eq(bookmarks.meetingId, id),
          eq(bookmarks.userId, session.userId),
        ),
      );
    return { ok: true };
  });
}
