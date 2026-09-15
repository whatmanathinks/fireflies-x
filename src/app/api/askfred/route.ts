import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { meetings, sentences, speakers } from "@/db/schema";
import { fail } from "@/lib/api";
import { fallbackAnswer, streamWorkspaceAnswer, type ChatTurn } from "@/lib/ai/askfred";
import { requireSession } from "@/lib/auth";
import { hasAnthropic } from "@/lib/env";
import { searchTranscripts } from "@/lib/queries";

export const maxDuration = 300;

const MAX_MEETINGS = 4;
const MAX_LINES_PER_MEETING = 260;

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

  const hits = await searchTranscripts(session.workspaceId, question, 80);

  const ranked = new Map<string, number>();
  for (const hit of hits) {
    ranked.set(hit.meetingId, (ranked.get(hit.meetingId) ?? 0) + Number(hit.rank ?? 1));
  }

  let meetingIds = [...ranked.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MEETINGS)
    .map(([id]) => id);

  if (meetingIds.length === 0) {
    const recent = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.workspaceId, session.workspaceId), eq(meetings.status, "completed")))
      .limit(MAX_MEETINGS);
    meetingIds = recent.map((m) => m.id);
  }

  if (meetingIds.length === 0) return fail("No transcribed meetings to search yet");

  const [meetingRows, sentenceRows, speakerRows] = await Promise.all([
    db.select().from(meetings).where(inArray(meetings.id, meetingIds)),
    db
      .select()
      .from(sentences)
      .where(inArray(sentences.meetingId, meetingIds))
      .orderBy(asc(sentences.index)),
    db.select().from(speakers).where(inArray(speakers.meetingId, meetingIds)),
  ]);

  const nameFor = new Map(
    speakerRows.map((s) => [`${s.meetingId}:${s.speakerIndex}`, s.displayName ?? s.label]),
  );

  const excerpts = meetingRows.map((meeting) => ({
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    lines: sentenceRows
      .filter((s) => s.meetingId === meeting.id)
      .slice(0, MAX_LINES_PER_MEETING)
      .map((s) => ({
        index: s.index,
        speakerName: nameFor.get(`${meeting.id}:${s.speakerIndex}`) ?? s.speakerName,
        startMs: s.startMs,
        text: s.text,
      })),
  }));

  const encoder = new TextEncoder();
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };

  if (!hasAnthropic()) {
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
