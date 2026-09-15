import { inArray } from "drizzle-orm";
import { Notebook } from "@/components/notebook/notebook";
import { db } from "@/db";
import { meetingChannels } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { listChannels, listMeetings } from "@/lib/queries";

export default async function MeetingsPage() {
  const session = await requireSession();

  const [meetings, channels] = await Promise.all([
    listMeetings(session.workspaceId, session.userId),
    listChannels(session.workspaceId),
  ]);

  const ids = meetings.map((m) => m.id);
  const links = ids.length
    ? await db
        .select()
        .from(meetingChannels)
        .where(inArray(meetingChannels.meetingId, ids))
    : [];

  const byMeeting = new Map<string, string[]>();
  for (const link of links) {
    byMeeting.set(link.meetingId, [...(byMeeting.get(link.meetingId) ?? []), link.channelId]);
  }

  return (
    <Notebook
      currentUserId={session.userId}
      currentUserEmail={session.email}
      channels={channels}
      meetings={meetings.map((m) => ({
        id: m.id,
        title: m.title,
        date: m.date.toISOString(),
        durationMs: m.durationMs,
        hostEmail: m.hostEmail,
        participants: m.participants,
        captureSource: m.captureSource,
        status: m.status,
        isLive: m.isLive,
        privacy: m.privacy,
        ownerId: m.ownerId,
        gist: m.gist,
        shortSummary: m.shortSummary,
        keywords: m.keywords,
        channelIds: byMeeting.get(m.id) ?? [],
      }))}
    />
  );
}

export const dynamic = "force-dynamic";
