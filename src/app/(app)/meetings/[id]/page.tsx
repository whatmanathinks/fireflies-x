import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notepad } from "@/components/notepad/notepad";
import { providerLabel } from "@/lib/ai/provider";
import { requireSession } from "@/lib/auth";
import { getMeeting, getMeetingBundle } from "@/lib/queries";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const meeting = await getMeeting(id, session.workspaceId);
  if (!meeting) notFound();

  const bundle = await getMeetingBundle(id);

  return (
    <Suspense>
      <Notepad
        provider={providerLabel()}
        progressNote={meeting.progressNote}
        failureCode={meeting.failureCode}
        failureReason={meeting.failureReason}
        meeting={{
          id: meeting.id,
          title: meeting.title,
          date: meeting.date,
          durationMs: meeting.durationMs,
          participants: meeting.participants,
          invited: meeting.invited,
          attendance: meeting.attendance,
          privacy: meeting.privacy,
          captureSource: meeting.captureSource,
          status: meeting.status,
          botState: meeting.botState,
          isLive: meeting.isLive,
          meetingLink: meeting.meetingLink,
          audioUrl: meeting.audioUrl,
          hostEmail: meeting.hostEmail,
          channels: bundle.channels,
        }}
        sentences={bundle.sentences.map((s) => ({
          id: s.id,
          index: s.index,
          speakerIndex: s.speakerIndex,
          speakerName:
            bundle.speakers.find((sp) => sp.speakerIndex === s.speakerIndex)?.displayName ??
            s.speakerName,
          text: s.text,
          startMs: s.startMs,
          endMs: s.endMs,
          aiFilters: s.aiFilters,
          edited: s.edited,
        }))}
        speakers={bundle.speakers.map((s) => ({
          speakerIndex: s.speakerIndex,
          label: s.label,
          displayName: s.displayName,
        }))}
        summary={bundle.summary}
        analytics={bundle.analytics}
        bites={bundle.bites.map((b) => ({
          id: b.id,
          name: b.name,
          startMs: b.startMs,
          endMs: b.endMs,
          shareToken: b.shareToken,
        }))}
        comments={bundle.comments.map((c) => ({
          id: c.id,
          parentId: c.parentId,
          authorName: c.authorName,
          body: c.body,
          timeMs: c.timeMs,
          createdAt: c.createdAt,
        }))}
        bookmarks={bundle.bookmarks.map((b) => ({
          id: b.id,
          label: b.label,
          timeMs: b.timeMs,
        }))}
      />
    </Suspense>
  );
}
