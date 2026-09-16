import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { fail, isInternalRequest, ok } from "@/lib/api";
import { failureCodeOf, isPermanent } from "@/lib/errors";
import { enqueue, runDueJobs } from "@/lib/jobs";
import { persistDeepgramResult } from "@/lib/stt/pipeline";
import type { DeepgramResponse } from "@/lib/stt/deepgram";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isInternalRequest(request)) return fail("Unauthorized", 401);

  const url = new URL(request.url);
  const meetingId = url.searchParams.get("meetingId");
  if (!meetingId) return fail("meetingId is required");

  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) return fail("Meeting not found", 404);

  if (meeting.status === "completed" || meeting.status === "summarizing") {
    return ok({ skipped: true, reason: "already processed" });
  }

  const payload = (await request.json()) as DeepgramResponse;

  try {
    await persistDeepgramResult(meetingId, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(meetings)
      .set({
        status: "failed",
        failureReason: message.slice(0, 500),
        failureCode: failureCodeOf(error),
      })
      .where(eq(meetings.id, meetingId));

    if (isPermanent(error)) {
      return ok({ received: true, outcome: "permanent_failure", reason: message });
    }
    return fail(message, 500);
  }

  await enqueue(meetingId, "summarize");
  after(() => runDueJobs(4));

  return ok({ received: true });
}
