import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetingChannels, meetings } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  privacy: z.enum(["private", "workspace", "public"]).optional(),
  channelIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid body");

  return handle(async () => {
    const session = await requireSession();
    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)),
    });
    if (!meeting) throw new Error("Meeting not found");

    const { title, privacy, channelIds } = parsed.data;

    if (title || privacy) {
      await db
        .update(meetings)
        .set({
          ...(title ? { title } : {}),
          ...(privacy ? { privacy } : {}),
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, id));
    }

    if (channelIds) {
      await db.delete(meetingChannels).where(eq(meetingChannels.meetingId, id));
      if (channelIds.length) {
        await db
          .insert(meetingChannels)
          .values(channelIds.map((channelId) => ({ meetingId: id, channelId })))
          .onConflictDoNothing();
      }
    }

    return { ok: true };
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(async () => {
    const session = await requireSession();
    await db
      .delete(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)));
    return { ok: true };
  });
}
