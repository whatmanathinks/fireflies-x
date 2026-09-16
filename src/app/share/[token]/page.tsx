import { eq } from "drizzle-orm";
import { Clock, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedMeeting } from "@/components/share/shared-meeting";
import { db } from "@/db";
import { meetings, shares } from "@/db/schema";
import { getMeetingBundle } from "@/lib/queries";
import { formatDuration } from "@/lib/utils";

async function load(token: string) {
  const share = await db.query.shares.findFirst({ where: eq(shares.token, token) });
  if (!share) return null;
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return null;

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, share.meetingId),
  });
  if (!meeting) return null;

  return { meeting, bundle: await getMeetingBundle(meeting.id) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await load(token);
  if (!data) return { title: "Link expired" };
  return {
    title: `${data.meeting.title} — Meeting notes`,
    description: data.bundle.summary?.shortSummary ?? undefined,
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();

  const { meeting, bundle } = data;
  const nameFor = new Map(
    bundle.speakers.map((s) => [s.speakerIndex, s.displayName ?? s.label]),
  );

  return (
    <main className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-6 py-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-[13px] font-bold text-white">
            F
          </span>
          <span className="text-[13px] font-semibold text-ink-900">FireflyX</span>
          <span className="ml-auto rounded-md bg-ink-100 px-2 py-0.5 text-[11.5px] text-ink-500">
            Shared notes
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900">{meeting.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-500">
          <span>
            {new Date(meeting.date).toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatDuration(meeting.durationMs)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {meeting.participants.length} participants
          </span>
        </div>

        <SharedMeeting
          summary={bundle.summary}
          sentences={bundle.sentences.map((s) => ({
            id: s.id,
            index: s.index,
            speakerName: nameFor.get(s.speakerIndex) ?? s.speakerName,
            speakerIndex: s.speakerIndex,
            text: s.text,
            startMs: s.startMs,
          }))}
          audioUrl={meeting.audioUrl}
        />
      </div>
    </main>
  );
}
