import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  channels,
  meetingAnalytics,
  meetingChannels,
  meetings,
  sentences as sentencesTable,
  speakers as speakersTable,
  summaries,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { heuristicClassify, heuristicSummary } from "@/lib/ai/fallback";
import { classifySentences, generateSummary, toAiFilters } from "@/lib/ai/summarize";
import { computeAnalytics } from "@/lib/analytics";
import { DEMO_NAME, DEMO_WORKSPACE, TEMPLATE_EMAIL } from "@/lib/constants";
import { hasAnthropic } from "@/lib/env";
import { buildSentences, fixtureDuration } from "@/lib/fixtures/build";
import { fixtures, type Fixture } from "@/lib/fixtures/transcripts";

const USE_AI = process.env.SEED_WITH_AI === "1" && hasAnthropic();

async function seedMeeting(
  fixture: Fixture,
  workspaceId: string,
  ownerId: string,
  daysAgo: number,
  channelId: string | null,
) {
  const built = buildSentences(fixture);
  const durationMs = fixtureDuration(built);
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  date.setHours(10 + (daysAgo % 6), (daysAgo * 7) % 60, 0, 0);

  const [meeting] = await db
    .insert(meetings)
    .values({
      workspaceId,
      ownerId,
      title: fixture.title,
      date,
      durationMs,
      hostEmail: fixture.participants[0],
      organizerEmail: fixture.participants[0],
      participants: fixture.participants,
      invited: fixture.invited,
      attendance: fixture.speakers.map((name, i) => ({
        name,
        joinMs: i === 0 ? 0 : 1000 * (15 + i * 20),
        leaveMs: durationMs - (i === 2 ? 45_000 : 0),
      })),
      captureSource: "seed",
      status: "completed",
      meetingLink: `https://meet.google.com/${fixture.key}-demo`,
      mimeType: "audio/webm",
    })
    .returning();

  if (channelId) {
    await db.insert(meetingChannels).values({ meetingId: meeting.id, channelId });
  }

  await db.insert(speakersTable).values(
    fixture.speakers.map((name, i) => ({
      meetingId: meeting.id,
      speakerIndex: i,
      label: `Speaker ${i + 1}`,
      displayName: name,
    })),
  );

  const lines = built.map((s) => ({
    index: s.index,
    speakerName: s.speakerName,
    startMs: s.startMs,
    text: s.text,
  }));

  const classified = USE_AI ? await classifySentences(lines) : heuristicClassify(lines);
  const filters = toAiFilters(classified, built.length);

  for (let i = 0; i < built.length; i += 200) {
    await db.insert(sentencesTable).values(
      built.slice(i, i + 200).map((s) => ({
        meetingId: meeting.id,
        index: s.index,
        speakerIndex: s.speakerIndex,
        speakerName: s.speakerName,
        text: s.text,
        rawText: s.rawText,
        startMs: s.startMs,
        endMs: s.endMs,
        words: s.words,
        aiFilters: filters[s.index],
      })),
    );
  }

  const summary = USE_AI
    ? await generateSummary(lines, "general", fixture.title)
    : heuristicSummary(lines, classified, fixture.title, fixture.meetingType);

  const indexToMs = new Map(built.map((s) => [s.index, s.startMs]));

  await db.insert(summaries).values({
    meetingId: meeting.id,
    template: "general",
    keywords: summary.keywords,
    actionItems: summary.action_items.map((a) => ({
      text: a.text,
      assignee: a.assignee,
      dueDate: a.due_date,
      sentenceIndex: a.sentence_index,
    })),
    outline: summary.outline.map((c) => ({
      title: c.title,
      startMs: indexToMs.get(c.start_sentence_index) ?? 0,
      summary: c.summary,
    })),
    shorthandBullet: summary.shorthand_bullet,
    overview: summary.overview,
    bulletGist: summary.bullet_gist,
    gist: summary.gist,
    shortSummary: summary.short_summary,
    meetingType: summary.meeting_type,
    topicsDiscussed: summary.topics_discussed,
  });

  const analytics = computeAnalytics(
    built.map((s) => ({ ...s, aiFilters: filters[s.index] })),
    new Map(fixture.speakers.map((n, i) => [i, n])),
    durationMs,
  );

  await db.insert(meetingAnalytics).values({ meetingId: meeting.id, ...analytics });

  if (summary.action_items.length) {
    await db.insert(tasks).values(
      summary.action_items.map((a) => ({
        workspaceId,
        meetingId: meeting.id,
        text: a.text,
        assignee: a.assignee,
        dueDate: a.due_date,
        sentenceIndex: a.sentence_index,
      })),
    );
  }

  return meeting;
}

async function main() {
  console.log(`Seeding (${USE_AI ? "real Claude" : "heuristic"} notes)...`);

  let user = await db.query.users.findFirst({ where: eq(users.email, TEMPLATE_EMAIL) });
  if (!user) {
    [user] = await db.insert(users).values({ email: TEMPLATE_EMAIL, name: DEMO_NAME }).returning();
  }

  let workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, user.id),
  });
  if (!workspace) {
    [workspace] = await db
      .insert(workspaces)
      .values({ name: DEMO_WORKSPACE, ownerId: user.id })
      .returning();
  }
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  await db.delete(meetings).where(eq(meetings.workspaceId, workspace.id));
  await db.delete(channels).where(eq(channels.workspaceId, workspace.id));

  const [engineering] = await db
    .insert(channels)
    .values({
      workspaceId: workspace.id,
      title: "Engineering",
      slug: "engineering",
      createdBy: user.id,
    })
    .returning();

  const [revenue] = await db
    .insert(channels)
    .values({
      workspaceId: workspace.id,
      title: "Revenue",
      slug: "revenue",
      createdBy: user.id,
    })
    .returning();

  await db
    .insert(channels)
    .values({
      workspaceId: workspace.id,
      title: "Leadership",
      slug: "leadership",
      isPrivate: true,
      createdBy: user.id,
    })
    .returning();

  const channelFor: Record<string, string | null> = {
    "roadmap-sync": engineering.id,
    "discovery-call": revenue.id,
    "one-on-one": null,
  };

  const days = [1, 3, 6];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const m = await seedMeeting(f, workspace.id, user.id, days[i], channelFor[f.key]);
    console.log(`  ✓ ${m.title}`);
  }

  console.log("\nDone. Template workspace ready — each demo visitor gets a private copy.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
