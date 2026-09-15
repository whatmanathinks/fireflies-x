import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bites, meetings } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { token } from "@/lib/utils";

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
});

async function assertAccess(meetingId: string, workspaceId: string) {
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.workspaceId, workspaceId)),
  });
  if (!meeting) throw new Error("Meeting not found");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid body");

  return handle(async () => {
    const session = await requireSession();
    await assertAccess(id, session.workspaceId);
    const [bite] = await db
      .insert(bites)
      .values({
        meetingId: id,
        name: parsed.data.name,
        startMs: parsed.data.startMs,
        endMs: Math.max(parsed.data.endMs, parsed.data.startMs + 1000),
        createdBy: session.userId,
        shareToken: token(20),
      })
      .returning();
    return bite;
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const biteId = new URL(request.url).searchParams.get("biteId");
  if (!biteId) return fail("biteId is required");

  return handle(async () => {
    const session = await requireSession();
    await assertAccess(id, session.workspaceId);
    await db.delete(bites).where(and(eq(bites.id, biteId), eq(bites.meetingId, id)));
    return { ok: true };
  });
}
