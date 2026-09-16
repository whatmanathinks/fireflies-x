import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const captureSource = pgEnum("capture_source", [
  "browser",
  "upload",
  "bot_sim",
  "seed",
]);

export const meetingStatus = pgEnum("meeting_status", [
  "scheduled",
  "recording",
  "uploading",
  "transcribing",
  "summarizing",
  "completed",
  "failed",
]);

export const botState = pgEnum("bot_state", [
  "idle",
  "joining",
  "waiting_for_host",
  "in_call",
  "leaving",
  "processing",
  "done",
  "failed",
]);

export const privacyLevel = pgEnum("privacy_level", [
  "private",
  "workspace",
  "public",
]);

export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

export const taskStatus = pgEnum("task_status", ["open", "done"]);

export const threadScope = pgEnum("thread_scope", [
  "meeting",
  "channel",
  "workspace",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultPrivacy: privacyLevel("default_privacy").notNull().default("workspace"),
  defaultTemplate: text("default_template").notNull().default("general"),
  language: text("language").notNull().default("en"),
  customVocabulary: text("custom_vocabulary").array().notNull().default([]),
  topicTrackers: jsonb("topic_trackers")
    .$type<{ name: string; keywords: string[] }[]>()
    .notNull()
    .default([]),
  autoJoinMode: text("auto_join_mode").notNull().default("owned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    isPrivate: boolean("is_private").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("channels_workspace_slug_idx").on(t.workspaceId, t.slug)],
);

export const channelMembers = pgTable(
  "channel_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull().default(0),
    hostEmail: text("host_email").notNull(),
    organizerEmail: text("organizer_email").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    participants: text("participants").array().notNull().default([]),
    attendance: jsonb("attendance")
      .$type<{ name: string; joinMs: number; leaveMs: number }[]>()
      .notNull()
      .default([]),
    invited: text("invited").array().notNull().default([]),
    privacy: privacyLevel("privacy").notNull().default("workspace"),
    captureSource: captureSource("capture_source").notNull().default("browser"),
    meetingLink: text("meeting_link"),
    audioUrl: text("audio_url"),
    mimeType: text("mime_type"),
    status: meetingStatus("status").notNull().default("scheduled"),
    isLive: boolean("is_live").notNull().default(false),
    botState: botState("bot_state").notNull().default("idle"),
    language: text("language").notNull().default("en"),
    sttRequestId: text("stt_request_id"),
    recallBotId: text("recall_bot_id"),
    failureReason: text("failure_reason"),
    failureCode: text("failure_code"),
    progressNote: text("progress_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meetings_workspace_date_idx").on(t.workspaceId, t.date),
    index("meetings_owner_idx").on(t.ownerId),
    index("meetings_stt_request_idx").on(t.sttRequestId),
  ],
);

export const meetingChannels = pgTable(
  "meeting_channels",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.channelId] })],
);

export const speakers = pgTable(
  "speakers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    speakerIndex: integer("speaker_index").notNull(),
    label: text("label").notNull(),
    displayName: text("display_name"),
    resolvedUserId: uuid("resolved_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("speakers_meeting_index_idx").on(t.meetingId, t.speakerIndex),
  ],
);

export type AiFilters = {
  task: boolean;
  question: boolean;
  metric: boolean;
  pricing: boolean;
  date_and_time: boolean;
  sentiment: "positive" | "neutral" | "negative";
};

export type Word = { w: string; s: number; e: number };

export const sentences = pgTable(
  "sentences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    speakerIndex: integer("speaker_index").notNull().default(0),
    speakerName: text("speaker_name").notNull(),
    text: text("text").notNull(),
    rawText: text("raw_text").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    words: jsonb("words").$type<Word[]>().notNull().default([]),
    aiFilters: jsonb("ai_filters").$type<AiFilters | null>(),
    edited: boolean("edited").notNull().default(false),
  },
  (t) => [
    uniqueIndex("sentences_meeting_index_idx").on(t.meetingId, t.index),
    index("sentences_meeting_start_idx").on(t.meetingId, t.startMs),
    index("sentences_search_idx").using("gin", sql`to_tsvector('english', ${t.text})`),
  ],
);

export type ActionItem = {
  text: string;
  assignee: string | null;
  dueDate: string | null;
  sentenceIndex: number | null;
};

export type Chapter = {
  title: string;
  startMs: number;
  summary: string;
};

export const summaries = pgTable(
  "summaries",
  {
    meetingId: uuid("meeting_id")
      .primaryKey()
      .references(() => meetings.id, { onDelete: "cascade" }),
    template: text("template").notNull().default("general"),
    keywords: text("keywords").array().notNull().default([]),
    actionItems: jsonb("action_items").$type<ActionItem[]>().notNull().default([]),
    outline: jsonb("outline").$type<Chapter[]>().notNull().default([]),
    shorthandBullet: text("shorthand_bullet").array().notNull().default([]),
    overview: text("overview").notNull().default(""),
    bulletGist: text("bullet_gist").array().notNull().default([]),
    gist: text("gist").notNull().default(""),
    shortSummary: text("short_summary").notNull().default(""),
    meetingType: text("meeting_type").notNull().default("general"),
    topicsDiscussed: text("topics_discussed").array().notNull().default([]),
    notes: text("notes").notNull().default(""),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type SpeakerAnalytics = {
  speakerIndex: number;
  name: string;
  durationMs: number;
  wordCount: number;
  longestMonologueMs: number;
  monologuesCount: number;
  fillerWords: number;
  questions: number;
  durationPct: number;
  wordsPerMinute: number;
  sentiment: { positive: number; neutral: number; negative: number };
};

export const meetingAnalytics = pgTable("meeting_analytics", {
  meetingId: uuid("meeting_id")
    .primaryKey()
    .references(() => meetings.id, { onDelete: "cascade" }),
  positivePct: real("positive_pct").notNull().default(0),
  neutralPct: real("neutral_pct").notNull().default(0),
  negativePct: real("negative_pct").notNull().default(0),
  talkTimeMs: integer("talk_time_ms").notNull().default(0),
  silenceMs: integer("silence_ms").notNull().default(0),
  questionCount: integer("question_count").notNull().default(0),
  taskCount: integer("task_count").notNull().default(0),
  speakers: jsonb("speakers").$type<SpeakerAnalytics[]>().notNull().default([]),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    assignee: text("assignee"),
    dueDate: text("due_date"),
    sentenceIndex: integer("sentence_index"),
    status: taskStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_workspace_status_idx").on(t.workspaceId, t.status)],
);

export const bites = pgTable(
  "bites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    shareToken: text("share_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bites_meeting_idx").on(t.meetingId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    timeMs: integer("time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_meeting_idx").on(t.meetingId)],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    timeMs: integer("time_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bookmarks_meeting_idx").on(t.meetingId)],
);

export const askfredThreads = pgTable("askfred_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scope: threadScope("scope").notNull().default("meeting"),
  meetingId: uuid("meeting_id").references(() => meetings.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull().default("New thread"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Citation = { meetingId: string; timeMs: number; label: string };

export const askfredMessages = pgTable(
  "askfred_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => askfredThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<Citation[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("askfred_messages_thread_idx").on(t.threadId)],
);

export const shares = pgTable("shares", {
  token: text("token").primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_meeting_step_idx").on(t.meetingId, t.step),
    index("jobs_status_idx").on(t.status, t.runAfter),
  ],
);
