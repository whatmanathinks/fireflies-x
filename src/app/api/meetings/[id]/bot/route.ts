import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { leaveCall } from "@/lib/bot/recall";
import { hasRecall } from "@/lib/env";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handle(async () => {
    const session = await requireSession();
    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)),
    });
    if (!meeting) throw new Error("Meeting not found");
    if (!meeting.recallBotId || !hasRecall()) throw new Error("No live notetaker on this meeting");

    await leaveCall(meeting.recallBotId);
    await db
      .update(meetings)
      .set({ botState: "leaving", isLive: false, updatedAt: new Date() })
      .where(eq(meetings.id, id));

    return { ok: true };
  });
}
