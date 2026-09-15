import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, shares } from "@/db/schema";
import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { token } from "@/lib/utils";

async function assertAccess(meetingId: string, workspaceId: string) {
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.workspaceId, workspaceId)),
  });
  if (!meeting) throw new Error("Meeting not found");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(async () => {
    const session = await requireSession();
    await assertAccess(id, session.workspaceId);
    const existing = await db.query.shares.findFirst({
      where: eq(shares.meetingId, id),
    });
    return { token: existing?.token ?? null, expiresAt: existing?.expiresAt ?? null };
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { expiresInDays?: number | null };

  return handle(async () => {
    const session = await requireSession();
    await assertAccess(id, session.workspaceId);

    await db.delete(shares).where(eq(shares.meetingId, id));

    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 86_400_000)
      : null;

    const [share] = await db
      .insert(shares)
      .values({ token: token(20), meetingId: id, createdBy: session.userId, expiresAt })
      .returning();

    await db.update(meetings).set({ privacy: "public" }).where(eq(meetings.id, id));

    return { token: share.token, expiresAt: share.expiresAt };
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(async () => {
    const session = await requireSession();
    await assertAccess(id, session.workspaceId);
    await db.delete(shares).where(eq(shares.meetingId, id));
    await db.update(meetings).set({ privacy: "workspace" }).where(eq(meetings.id, id));
    return { ok: true };
  });
}
