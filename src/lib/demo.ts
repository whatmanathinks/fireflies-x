import { and, eq, inArray, like, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  channels,
  meetingAnalytics,
  meetingChannels,
  meetings,
  sentences,
  speakers,
  summaries,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { DEMO_NAME, TEMPLATE_EMAIL } from "@/lib/constants";
import { token } from "@/lib/utils";

export async function templateWorkspace() {
  const owner = await db.query.users.findFirst({ where: eq(users.email, TEMPLATE_EMAIL) });
  if (!owner) return null;
  return db.query.workspaces.findFirst({ where: eq(workspaces.ownerId, owner.id) });
}

export async function createDemoSandbox() {
  const email = `guest-${token(10)}@fireflyx.app`;

  const [user] = await db.insert(users).values({ email, name: DEMO_NAME }).returning();

  const template = await templateWorkspace();

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: template?.name ?? "Demo Workspace",
      ownerId: user.id,
      defaultPrivacy: template?.defaultPrivacy ?? "workspace",
      defaultTemplate: template?.defaultTemplate ?? "general",
      language: template?.language ?? "en",
      customVocabulary: template?.customVocabulary ?? [],
    })
    .returning();

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  if (template) await cloneWorkspace(template.id, workspace.id, user.id);

  return user;
}

async function cloneWorkspace(fromId: string, toId: string, ownerId: string) {
  const sourceChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, fromId));

  const channelMap = new Map<string, string>();
  if (sourceChannels.length) {
    const created = await db
      .insert(channels)
      .values(
        sourceChannels.map((c) => ({
          workspaceId: toId,
          title: c.title,
          slug: c.slug,
          isPrivate: c.isPrivate,
          createdBy: ownerId,
        })),
      )
      .returning();
    sourceChannels.forEach((c, i) => channelMap.set(c.id, created[i].id));
  }

  const sourceMeetings = await db
    .select()
    .from(meetings)
    .where(eq(meetings.workspaceId, fromId));
  if (!sourceMeetings.length) return;

  const createdMeetings = await db
    .insert(meetings)
    .values(
      sourceMeetings.map((m) => ({
        workspaceId: toId,
        ownerId,
        title: m.title,
        date: m.date,
        durationMs: m.durationMs,
        hostEmail: m.hostEmail,
        organizerEmail: m.organizerEmail,
        participants: m.participants,
        attendance: m.attendance,
        invited: m.invited,
        privacy: m.privacy,
        captureSource: m.captureSource,
        meetingLink: m.meetingLink,
        audioUrl: m.audioUrl,
        mimeType: m.mimeType,
        status: m.status,
        language: m.language,
      })),
    )
    .returning();

  const meetingMap = new Map<string, string>();
  sourceMeetings.forEach((m, i) => meetingMap.set(m.id, createdMeetings[i].id));
  const sourceIds = sourceMeetings.map((m) => m.id);

  const links = await db
    .select()
    .from(meetingChannels)
    .where(inArray(meetingChannels.meetingId, sourceIds));
  if (links.length) {
    const rows = links
      .filter((l) => meetingMap.has(l.meetingId) && channelMap.has(l.channelId))
      .map((l) => ({
        meetingId: meetingMap.get(l.meetingId)!,
        channelId: channelMap.get(l.channelId)!,
      }));
    if (rows.length) await db.insert(meetingChannels).values(rows).onConflictDoNothing();
  }

  const sourceSpeakers = await db
    .select()
    .from(speakers)
    .where(inArray(speakers.meetingId, sourceIds));
  if (sourceSpeakers.length) {
    await db.insert(speakers).values(
      sourceSpeakers.map((s) => ({
        meetingId: meetingMap.get(s.meetingId)!,
        speakerIndex: s.speakerIndex,
        label: s.label,
        displayName: s.displayName,
      })),
    );
  }

  const sourceSentences = await db
    .select()
    .from(sentences)
    .where(inArray(sentences.meetingId, sourceIds));
  for (let i = 0; i < sourceSentences.length; i += 500) {
    await db.insert(sentences).values(
      sourceSentences.slice(i, i + 500).map((s) => ({
        meetingId: meetingMap.get(s.meetingId)!,
        index: s.index,
        speakerIndex: s.speakerIndex,
        speakerName: s.speakerName,
        text: s.text,
        rawText: s.rawText,
        startMs: s.startMs,
        endMs: s.endMs,
        words: s.words,
        aiFilters: s.aiFilters,
      })),
    );
  }

  const sourceSummaries = await db
    .select()
    .from(summaries)
    .where(inArray(summaries.meetingId, sourceIds));
  if (sourceSummaries.length) {
    await db.insert(summaries).values(
      sourceSummaries.map((s) => ({ ...s, meetingId: meetingMap.get(s.meetingId)! })),
    );
  }

  const sourceAnalytics = await db
    .select()
    .from(meetingAnalytics)
    .where(inArray(meetingAnalytics.meetingId, sourceIds));
  if (sourceAnalytics.length) {
    await db.insert(meetingAnalytics).values(
      sourceAnalytics.map((a) => ({ ...a, meetingId: meetingMap.get(a.meetingId)! })),
    );
  }

  const sourceTasks = await db.select().from(tasks).where(eq(tasks.workspaceId, fromId));
  if (sourceTasks.length) {
    await db.insert(tasks).values(
      sourceTasks
        .filter((t) => meetingMap.has(t.meetingId))
        .map((t) => ({
          workspaceId: toId,
          meetingId: meetingMap.get(t.meetingId)!,
          text: t.text,
          assignee: t.assignee,
          dueDate: t.dueDate,
          sentenceIndex: t.sentenceIndex,
          status: t.status,
        })),
    );
  }
}

export async function pruneOldSandboxes(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await db
    .delete(users)
    .where(and(like(users.email, "guest-%@fireflyx.app"), lt(users.createdAt, cutoff)))
    .returning({ id: users.id });
  return rows.length;
}
