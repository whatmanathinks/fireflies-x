import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { enqueue, runDueJobs } from "@/lib/jobs";
import { env } from "@/lib/env";

export const maxDuration = 300;

type RecallWebhook = {
  event?: string;
  data?: {
    data?: { code?: string; sub_code?: string | null };
    bot?: { id?: string; metadata?: Record<string, string> };
  };
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== env.internalSecret) {
    return fail("Unauthorized", 401);
  }

  const payload = (await request.json().catch(() => null)) as RecallWebhook | null;
  const botId = payload?.data?.bot?.id;
  if (!botId) return fail("Missing bot id");

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.recallBotId, botId),
  });
  if (!meeting) return ok({ skipped: true, reason: "unknown bot" });

  await enqueue(meeting.id, "bot");
  after(() => runDueJobs(2));

  return ok({ received: true, event: payload?.event });
}
