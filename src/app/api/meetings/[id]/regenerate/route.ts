import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { enqueue, runDueJobs } from "@/lib/jobs";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { template?: string };

  return handle(async () => {
    const session = await requireSession();
    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)),
    });
    if (!meeting) throw new Error("Meeting not found");

    await enqueue(id, "summarize", { template: body.template ?? "general" });
    after(() => runDueJobs(4));
    return { queued: true };
  });
}
