import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { fail } from "@/lib/api";
import { fallbackAnswer, streamMeetingAnswer, type ChatTurn } from "@/lib/ai/askfred";
import { inputBudget } from "@/lib/ai/chunking";
import { buildMeetingContext } from "@/lib/ai/retrieval";
import { requireSession } from "@/lib/auth";
import { env, hasAnthropic } from "@/lib/env";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let session;
  try {
    session = await requireSession();
  } catch {
    return fail("Unauthorized", 401);
  }

  const body = (await request.json().catch(() => null)) as {
    question?: string;
    history?: ChatTurn[];
  } | null;

  const question = body?.question?.trim();
  if (!question) return fail("question is required");

  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, id), eq(meetings.workspaceId, session.workspaceId)),
  });
  if (!meeting) return fail("Meeting not found", 404);

  const answerBudget = Math.min(env.llmMaxTokens, 2000);
  const context = await buildMeetingContext(id, question, inputBudget(answerBudget));
  const lines = context.lines;

  if (!lines.length) return fail("This meeting has no transcript yet");

  const encoder = new TextEncoder();

  if (!hasAnthropic()) {
    const text = fallbackAnswer(lines, question);
    return new Response(
      new ReadableStream({
        start(controller) {
          let i = 0;
          const tick = () => {
            if (i >= text.length) {
              controller.close();
              return;
            }
            controller.enqueue(encoder.encode(text.slice(i, i + 4)));
            i += 4;
            setTimeout(tick, 12);
          };
          tick();
        },
      }),
      { headers: streamHeaders() },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamMeetingAnswer(
          lines,
          meeting.title,
          body?.history ?? [],
          question,
          { partial: context.covered === "retrieved", summaryDigest: context.summaryDigest },
        )) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `\n\n_Something went wrong: ${error instanceof Error ? error.message : "unknown error"}_`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: streamHeaders() });
}

function streamHeaders() {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };
}
