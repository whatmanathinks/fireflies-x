import { desc, eq } from "drizzle-orm";
import { ArrowRight, CalendarDays, Clock, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";
import { QuickActions } from "@/components/shell/quick-actions";
import { Avatar, AvatarStack, Badge, Card, EmptyState, SectionLabel } from "@/components/ui/misc";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { hasBlob, hasDeepgram, hasRecall } from "@/lib/env";
import { listTasks, recentMeetingsWithSummary, workspaceStats } from "@/lib/queries";
import { formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireSession();

  const [recent, tasks, stats, active] = await Promise.all([
    recentMeetingsWithSummary(session.workspaceId, 6),
    listTasks(session.workspaceId, "open"),
    workspaceStats(session.workspaceId),
    db
      .select()
      .from(meetings)
      .where(eq(meetings.workspaceId, session.workspaceId))
      .orderBy(desc(meetings.date))
      .limit(30),
  ]);

  const inFlight = active.filter((m) => m.status !== "completed" && m.status !== "failed");
  const firstName = session.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const feedItems = recent
    .filter((m) => m.bulletGist && m.bulletGist.length > 0)
    .flatMap((m) =>
      (m.bulletGist ?? []).slice(0, 2).map((line) => ({
        meetingId: m.id,
        meetingTitle: m.title,
        date: m.date,
        line,
      })),
    )
    .slice(0, 6);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-500">
          {stats.meetingCount === 0
            ? "Capture your first meeting to see notes, tasks and analytics here."
            : `${stats.meetingCount} meetings · ${formatDuration(stats.totalMs)} captured · ${stats.openTasks} open ${stats.openTasks === 1 ? "task" : "tasks"}`}
        </p>

        <QuickActions
          liveEnabled={hasDeepgram()}
          blobEnabled={hasBlob()}
          realNotetaker={hasRecall()}
        />

        {inFlight.length > 0 && (
          <section className="mt-7">
            <SectionLabel className="mb-2.5">In progress</SectionLabel>
            <div className="space-y-2">
              {inFlight.map((m) => (
                <Link key={m.id} href={`/meetings/${m.id}`}>
                  <Card className="flex items-center gap-3 px-3.5 py-2.5 transition hover:border-brand-300">
                    <span className="live-dot size-2 rounded-full bg-amber-500" />
                    <span className="flex-1 truncate text-[13px] font-medium text-ink-900">
                      {m.title}
                    </span>
                    <Badge tone="amber">{m.status}</Badge>
                    <ArrowRight className="size-3.5 text-ink-400" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <section>
            <div className="mb-2.5 flex items-center justify-between">
              <SectionLabel>Recent meetings</SectionLabel>
              <Link
                href="/meetings"
                className="text-[12px] font-medium text-brand-600 hover:underline"
              >
                View all
              </Link>
            </div>

            {recent.length === 0 ? (
              <Card>
                <EmptyState
                  icon={CalendarDays}
                  title="No meetings yet"
                  description="Record a call, upload audio, or send the notetaker to a live meeting."
                />
              </Card>
            ) : (
              <div className="space-y-2">
                {recent.map((m) => (
                  <Link key={m.id} href={`/meetings/${m.id}`}>
                    <Card className="px-3.5 py-3 transition hover:border-brand-300">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-ink-900">
                            {m.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-400">
                            <span>
                              {new Date(m.date).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            <Clock className="size-3" />
                            <span>{formatDuration(m.durationMs)}</span>
                          </div>
                          {m.gist && (
                            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-600">
                              {m.gist}
                            </p>
                          )}
                        </div>
                        <AvatarStack
                          names={m.participants.map((p) => p.split("@")[0])}
                          size={22}
                          max={3}
                        />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <SectionLabel>Your tasks</SectionLabel>
                <Link
                  href="/tasks"
                  className="text-[12px] font-medium text-brand-600 hover:underline"
                >
                  All tasks
                </Link>
              </div>
              <Card className="p-3">
                {tasks.length === 0 ? (
                  <p className="py-5 text-center text-[12.5px] text-ink-400">
                    No open tasks. Action items from your meetings land here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tasks.slice(0, 5).map((t) => (
                      <Link
                        key={t.id}
                        href={`/meetings/${t.meetingId}`}
                        className="flex gap-2.5 rounded-lg px-1 py-1 hover:bg-ink-50"
                      >
                        <ListChecks className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-800">
                            {t.text}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {t.assignee && (
                              <span className="flex items-center gap-1 text-[11px] text-ink-500">
                                <Avatar name={t.assignee} size={14} />
                                {t.assignee}
                              </span>
                            )}
                            {t.dueDate && <Badge tone="amber">{t.dueDate}</Badge>}
                          </div>
                        </div>
                      </Link>
                    ))}
                    {tasks.length > 5 && (
                      <p className="pt-1 text-center text-[11.5px] text-ink-400">
                        +{tasks.length - 5} more
                      </p>
                    )}
                  </div>
                )}
              </Card>
            </section>

            <section>
              <SectionLabel className="mb-2.5">AI feed</SectionLabel>
              <Card className="p-3">
                {feedItems.length === 0 ? (
                  <p className="py-5 text-center text-[12.5px] text-ink-400">
                    Takeaways from your recent meetings will appear here.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {feedItems.map((item, i) => (
                      <Link
                        key={i}
                        href={`/meetings/${item.meetingId}`}
                        className="block rounded-lg px-1 py-1 hover:bg-ink-50"
                      >
                        <p className="flex gap-2 text-[12.5px] leading-relaxed text-ink-700">
                          <Sparkles className="mt-0.5 size-3 shrink-0 text-brand-500" />
                          <span className="line-clamp-2">{item.line}</span>
                        </p>
                        <p className="ml-5 mt-0.5 truncate text-[11px] text-ink-400">
                          {item.meetingTitle}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
