import { eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { meetingChannels, meetings, workspaces } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { createBot } from "@/lib/bot/recall";
import { hasRecall } from "@/lib/env";
import { enqueue, runDueJobs } from "@/lib/jobs";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  source: z.enum(["browser", "upload", "bot_sim"]),
  meetingLink: z.string().url().optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  durationMs: z.number().int().nonnegative().optional(),
  channelId: z.string().uuid().optional().nullable(),
  participants: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid body");

  return handle(async () => {
    const session = await requireSession();
    const input = parsed.data;

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, session.workspaceId),
    });

    const [meeting] = await db
      .insert(meetings)
      .values({
        workspaceId: session.workspaceId,
        ownerId: session.userId,
        title: input.title,
        hostEmail: session.email,
        organizerEmail: session.email,
        participants: input.participants ?? [session.email],
        invited: input.participants ?? [session.email],
        captureSource: input.source,
        meetingLink: input.meetingLink ?? null,
        audioUrl: input.audioUrl ?? null,
        mimeType: input.mimeType ?? null,
        durationMs: input.durationMs ?? 0,
        privacy: workspace?.defaultPrivacy ?? "workspace",
        status:
          input.source === "upload"
            ? "uploading"
            : input.source === "bot_sim"
              ? "scheduled"
              : "recording",
        isLive: input.source === "browser",
        botState: input.source === "bot_sim" ? "idle" : "idle",
      })
      .returning();

    if (input.channelId) {
      await db
        .insert(meetingChannels)
        .values({ meetingId: meeting.id, channelId: input.channelId })
        .onConflictDoNothing();
    }

    if (input.source === "upload" && input.audioUrl) {
      await enqueue(meeting.id, "transcribe");
      after(() => runDueJobs(4));
    }

    if (input.source === "bot_sim") {
      if (hasRecall() && input.meetingLink) {
        try {
          const bot = await createBot(
            input.meetingLink,
            workspace?.name ? `${workspace.name} Notetaker` : "Notetaker",
            meeting.id,
          );
          await db
            .update(meetings)
            .set({ recallBotId: bot.id, botState: "joining", status: "recording" })
            .where(eq(meetings.id, meeting.id));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not dispatch notetaker";
          await db
            .update(meetings)
            .set({ botState: "failed", status: "failed", failureReason: message.slice(0, 500) })
            .where(eq(meetings.id, meeting.id));
          throw new Error(message);
        }
      }

      await enqueue(meeting.id, "bot", {}, 1500);
      after(() => runDueJobs(4));
    }

    return { id: meeting.id, status: meeting.status, simulated: !hasRecall() };
  });
}
