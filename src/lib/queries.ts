import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bites,
  bookmarks,
  channels,
  comments,
  meetingAnalytics,
  meetingChannels,
  meetings,
  sentences,
  speakers,
  summaries,
  tasks,
} from "@/db/schema";

export type MeetingFilters = {
  channel?: string;
  hostedByMe?: boolean;
  query?: string;
  from?: Date;
  to?: Date;
  minDurationMs?: number;
  captureSource?: string;
  participant?: string;
};

export async function listChannels(workspaceId: string) {
  return db
    .select({
      id: channels.id,
      title: channels.title,
      slug: channels.slug,
      isPrivate: channels.isPrivate,
      count: sql<number>`(select count(*) from ${meetingChannels} where ${meetingChannels.channelId} = ${channels.id})::int`,
    })
    .from(channels)
    .where(eq(channels.workspaceId, workspaceId))
    .orderBy(asc(channels.title));
}

export async function listMeetings(
  workspaceId: string,
  userId: string,
  filters: MeetingFilters = {},
) {
  const conds = [eq(meetings.workspaceId, workspaceId)];

  if (filters.hostedByMe) conds.push(eq(meetings.ownerId, userId));
  if (filters.captureSource === "upload") conds.push(eq(meetings.captureSource, "upload"));
  else if (filters.captureSource === "browser") conds.push(eq(meetings.captureSource, "browser"));
  else if (filters.captureSource === "bot_sim") conds.push(eq(meetings.captureSource, "bot_sim"));
  if (filters.from) conds.push(gte(meetings.date, filters.from));
  if (filters.to) conds.push(lte(meetings.date, filters.to));
  if (filters.minDurationMs) conds.push(gte(meetings.durationMs, filters.minDurationMs));
  if (filters.query) {
    const like = `%${filters.query.toLowerCase()}%`;
    conds.push(sql`lower(${meetings.title}) like ${like}`);
  }
  if (filters.participant) {
    conds.push(sql`${filters.participant} = any(${meetings.participants})`);
  }
  if (filters.channel) {
    conds.push(
      sql`exists (select 1 from ${meetingChannels} mc where mc.meeting_id = ${meetings.id} and mc.channel_id = ${filters.channel})`,
    );
  }

  return db
    .select({
      id: meetings.id,
      title: meetings.title,
      date: meetings.date,
      durationMs: meetings.durationMs,
      hostEmail: meetings.hostEmail,
      participants: meetings.participants,
      captureSource: meetings.captureSource,
      status: meetings.status,
      isLive: meetings.isLive,
      botState: meetings.botState,
      privacy: meetings.privacy,
      ownerId: meetings.ownerId,
      gist: summaries.gist,
      shortSummary: summaries.shortSummary,
      keywords: summaries.keywords,
    })
    .from(meetings)
    .leftJoin(summaries, eq(summaries.meetingId, meetings.id))
    .where(and(...conds))
    .orderBy(desc(meetings.date))
    .limit(200);
}

export async function getMeeting(meetingId: string, workspaceId: string) {
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.workspaceId, workspaceId)),
  });
  if (!meeting) return null;
  return meeting;
}

export async function getMeetingBundle(meetingId: string) {
  const [rows, speakerRows, summary, analytics, biteRows, commentRows, bookmarkRows, channelRows] =
    await Promise.all([
      db
        .select()
        .from(sentences)
        .where(eq(sentences.meetingId, meetingId))
        .orderBy(asc(sentences.index)),
      db
        .select()
        .from(speakers)
        .where(eq(speakers.meetingId, meetingId))
        .orderBy(asc(speakers.speakerIndex)),
      db.query.summaries.findFirst({ where: eq(summaries.meetingId, meetingId) }),
      db.query.meetingAnalytics.findFirst({
        where: eq(meetingAnalytics.meetingId, meetingId),
      }),
      db.select().from(bites).where(eq(bites.meetingId, meetingId)).orderBy(asc(bites.startMs)),
      db
        .select()
        .from(comments)
        .where(eq(comments.meetingId, meetingId))
        .orderBy(asc(comments.createdAt)),
      db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.meetingId, meetingId))
        .orderBy(asc(bookmarks.timeMs)),
      db
        .select({ id: channels.id, title: channels.title, isPrivate: channels.isPrivate })
        .from(meetingChannels)
        .innerJoin(channels, eq(channels.id, meetingChannels.channelId))
        .where(eq(meetingChannels.meetingId, meetingId)),
    ]);

  return {
    sentences: rows,
    speakers: speakerRows,
    summary: summary ?? null,
    analytics: analytics ?? null,
    bites: biteRows,
    comments: commentRows,
    bookmarks: bookmarkRows,
    channels: channelRows,
  };
}

export async function listTasks(workspaceId: string, status?: "open" | "done") {
  const conds = [eq(tasks.workspaceId, workspaceId)];
  if (status) conds.push(eq(tasks.status, status));
  return db
    .select({
      id: tasks.id,
      text: tasks.text,
      assignee: tasks.assignee,
      dueDate: tasks.dueDate,
      status: tasks.status,
      sentenceIndex: tasks.sentenceIndex,
      createdAt: tasks.createdAt,
      meetingId: tasks.meetingId,
      meetingTitle: meetings.title,
      meetingDate: meetings.date,
    })
    .from(tasks)
    .innerJoin(meetings, eq(meetings.id, tasks.meetingId))
    .where(and(...conds))
    .orderBy(desc(meetings.date));
}

export type SearchHit = {
  meetingId: string;
  meetingTitle: string;
  meetingDate: Date;
  index: number;
  speakerName: string;
  text: string;
  startMs: number;
  rank: number;
};

export async function searchTranscripts(
  workspaceId: string,
  query: string,
  limit = 60,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rows = await db.execute<SearchHit>(sql`
    select
      s.meeting_id       as "meetingId",
      m.title            as "meetingTitle",
      m.date             as "meetingDate",
      s.index            as "index",
      s.speaker_name     as "speakerName",
      s.text             as "text",
      s.start_ms         as "startMs",
      ts_rank(to_tsvector('english', s.text), websearch_to_tsquery('english', ${trimmed})) as "rank"
    from sentences s
    join meetings m on m.id = s.meeting_id
    where m.workspace_id = ${workspaceId}
      and to_tsvector('english', s.text) @@ websearch_to_tsquery('english', ${trimmed})
    order by "rank" desc, m.date desc
    limit ${limit}
  `);

  return rows as unknown as SearchHit[];
}

export async function filterHits(
  workspaceId: string,
  filter: "task" | "question" | "metric" | "pricing" | "date_and_time",
  limit = 100,
) {
  return db
    .select({
      meetingId: sentences.meetingId,
      meetingTitle: meetings.title,
      meetingDate: meetings.date,
      index: sentences.index,
      speakerName: sentences.speakerName,
      text: sentences.text,
      startMs: sentences.startMs,
    })
    .from(sentences)
    .innerJoin(meetings, eq(meetings.id, sentences.meetingId))
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        sql`(${sentences.aiFilters} ->> ${filter})::boolean is true`,
      ),
    )
    .orderBy(desc(meetings.date), asc(sentences.index))
    .limit(limit);
}

export async function workspaceStats(workspaceId: string) {
  const [row] = await db
    .select({
      meetingCount: sql<number>`count(*)::int`,
      totalMs: sql<number>`coalesce(sum(${meetings.durationMs}), 0)::bigint`,
    })
    .from(meetings)
    .where(eq(meetings.workspaceId, workspaceId));

  const analytics = await db
    .select({ speakers: meetingAnalytics.speakers, meetingId: meetingAnalytics.meetingId })
    .from(meetingAnalytics)
    .innerJoin(meetings, eq(meetings.id, meetingAnalytics.meetingId))
    .where(eq(meetings.workspaceId, workspaceId));

  const [taskRow] = await db
    .select({
      open: sql<number>`count(*) filter (where ${tasks.status} = 'open')::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId));

  return {
    meetingCount: Number(row?.meetingCount ?? 0),
    totalMs: Number(row?.totalMs ?? 0),
    openTasks: Number(taskRow?.open ?? 0),
    doneTasks: Number(taskRow?.done ?? 0),
    analytics,
  };
}

export async function meetingsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(meetings).where(inArray(meetings.id, ids));
}

export async function recentMeetingsWithSummary(workspaceId: string, limit = 5) {
  return db
    .select({
      id: meetings.id,
      title: meetings.title,
      date: meetings.date,
      durationMs: meetings.durationMs,
      participants: meetings.participants,
      status: meetings.status,
      captureSource: meetings.captureSource,
      gist: summaries.gist,
      shortSummary: summaries.shortSummary,
      bulletGist: summaries.bulletGist,
    })
    .from(meetings)
    .leftJoin(summaries, eq(summaries.meetingId, meetings.id))
    .where(and(eq(meetings.workspaceId, workspaceId), or(eq(meetings.status, "completed"), eq(meetings.isLive, true))))
    .orderBy(desc(meetings.date))
    .limit(limit);
}
