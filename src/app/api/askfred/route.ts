import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { fail } from "@/lib/api";
import { fallbackAnswer, streamWorkspaceAnswer, type ChatTurn } from "@/lib/ai/askfred";
import { inputBudget } from "@/lib/ai/chunking";
import { buildWorkspaceContext, meetingsMatching } from "@/lib/ai/retrieval";
import { requireSession } from "@/lib/auth";
import { env, hasLlm } from "@/lib/env";

export const maxDuration = 300;

const MAX_MEETINGS = 4;

export async function POST(request: Request) {
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

  const answerBudget = Math.min(env.llmMaxTokens, 2000);
  const totalBudget = inputBudget(answerBudget);

  let meetingIds = await meetingsMatching(session.workspaceId, question, MAX_MEETINGS);

  if (meetingIds.length === 0) {
    const recent = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.workspaceId, session.workspaceId), eq(meetings.status, "completed")))
      .orderBy(desc(meetings.date))
      .limit(MAX_MEETINGS);
    meetingIds = recent.map((m) => m.id);
  }

  if (meetingIds.length === 0) return fail("No transcribed meetings to search yet");

  const meetingRows = await db
    .select({ id: meetings.id, title: meetings.title })
    .from(meetings)
    .where(inArray(meetings.id, meetingIds));

  const titleFor = new Map(meetingRows.map((m) => [m.id, m.title]));
  const perMeeting = Math.max(700, Math.floor(totalBudget / meetingIds.length));
  const contexts = await buildWorkspaceContext(meetingIds, question, perMeeting);

  const excerpts = contexts
    .filter((c) => c.lines.length > 0)
    .map((c) => ({
      meetingId: c.meetingId,
      meetingTitle: titleFor.get(c.meetingId) ?? "Untitled meeting",
      lines: c.lines,
      summaryDigest: c.summaryDigest,
    }));

  if (!excerpts.length) return fail("No transcribed meetings to search yet");

  const encoder = new TextEncoder();
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };

  if (!hasLlm()) {
    const text = fallbackAnswer(excerpts.flatMap((e) => e.lines), question);
    return new Response(
      new ReadableStream({
        start(controller) {
          let i = 0;
          const tick = () => {
            if (i >= text.length) return controller.close();
            controller.enqueue(encoder.encode(text.slice(i, i + 4)));
            i += 4;
            setTimeout(tick, 10);
          };
          tick();
        },
      }),
      { headers },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamWorkspaceAnswer(
          excerpts,
          body?.history ?? [],
          question,
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

  return new Response(stream, { headers });
}
