import { BarChart3, Clock, ListChecks, Users } from "lucide-react";
import {
  seriesColor,
  SENTIMENT_NEGATIVE,
  SENTIMENT_NEUTRAL,
  SENTIMENT_POSITIVE,
} from "@/lib/viz";
import { Card, EmptyState, SectionLabel } from "@/components/ui/misc";
import { requireSession } from "@/lib/auth";
import { listMeetings, workspaceStats } from "@/lib/queries";
import { formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await requireSession();
  const [stats, meetings] = await Promise.all([
    workspaceStats(session.workspaceId),
    listMeetings(session.workspaceId, session.userId),
  ]);

  const talkBySpeaker = new Map<string, { durationMs: number; words: number; meetings: number }>();
  let positive = 0;
  let neutral = 0;
  let negative = 0;

  for (const row of stats.analytics) {
    for (const speaker of row.speakers) {
      const prev = talkBySpeaker.get(speaker.name) ?? { durationMs: 0, words: 0, meetings: 0 };
      talkBySpeaker.set(speaker.name, {
        durationMs: prev.durationMs + speaker.durationMs,
        words: prev.words + speaker.wordCount,
        meetings: prev.meetings + 1,
      });
      positive += speaker.sentiment.positive;
      neutral += speaker.sentiment.neutral;
      negative += speaker.sentiment.negative;
    }
  }

  const leaderboard = [...talkBySpeaker.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 12);

  const maxTalk = Math.max(...leaderboard.map((l) => l.durationMs), 1);
  const sentimentTotal = Math.max(1, positive + neutral + negative);

  const byWeek = new Map<string, number>();
  for (const m of meetings) {
    const d = new Date(m.date);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
  }
  const weeks = [...byWeek.entries()].sort().slice(-12);
  const maxWeek = Math.max(...weeks.map(([, c]) => c), 1);

  if (stats.meetingCount === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          description="Once you've captured a meeting, talk-time, sentiment and participation appear here."
        />
      </div>
    );
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Analytics</h1>
        <p className="mt-1 text-[13.5px] text-ink-500">
          Participation across your whole workspace, computed from word-level timings.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Stat icon={BarChart3} label="Meetings" value={String(stats.meetingCount)} />
          <Stat icon={Clock} label="Captured" value={formatDuration(stats.totalMs)} />
          <Stat icon={Users} label="Speakers" value={String(talkBySpeaker.size)} />
          <Stat
            icon={ListChecks}
            label="Tasks"
            value={`${stats.doneTasks}/${stats.openTasks + stats.doneTasks}`}
            hint="completed"
          />
        </div>

        {weeks.length > 1 && (
          <section className="mt-7">
            <SectionLabel className="mb-2.5">Meetings per week</SectionLabel>
            <Card className="px-4 py-4">
              <div className="flex h-28 items-end gap-3">
                {weeks.map(([week, count]) => (
                  <div
                    key={week}
                    className="flex max-w-14 flex-1 flex-col items-center gap-1.5"
                  >
                    <span className="text-[10.5px] tabular-nums text-ink-400">{count}</span>
                    <div
                      className="w-full rounded-t-[3px] bg-brand-500"
                      style={{ height: `${Math.max(4, (count / maxWeek) * 78)}px` }}
                      title={`Week of ${new Date(week).toLocaleDateString()}: ${count}`}
                    />
                    <span className="text-[9.5px] text-ink-400">
                      {new Date(week).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                ))}
                <div className="flex-[6]" />
              </div>
            </Card>
          </section>
        )}

        <section className="mt-7">
          <SectionLabel className="mb-2.5">Talk time by person</SectionLabel>
          <Card className="space-y-2 px-4 py-4">
            {leaderboard.map((person, i) => (
              <div key={person.name} className="flex items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ background: seriesColor(i) }}
                />
                <span className="w-36 shrink-0 truncate text-[12.5px] font-medium text-ink-800">
                  {person.name}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(person.durationMs / maxTalk) * 100}%`,
                      background: seriesColor(i),
                    }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-600">
                  {formatDuration(person.durationMs)}
                </span>
                <span className="w-20 shrink-0 text-right text-[11px] text-ink-400">
                  {person.meetings} {person.meetings === 1 ? "meeting" : "meetings"}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section className="mt-7">
          <SectionLabel className="mb-2.5">Sentiment across all meetings</SectionLabel>
          <Card className="px-4 py-4">
            <div className="flex h-7 overflow-hidden rounded-md">
              <div
                style={{ width: `${(negative / sentimentTotal) * 100}%`, background: SENTIMENT_NEGATIVE, marginRight: 2 }}
              />
              <div
                style={{ width: `${(neutral / sentimentTotal) * 100}%`, background: SENTIMENT_NEUTRAL, marginRight: 2 }}
              />
              <div style={{ width: `${(positive / sentimentTotal) * 100}%`, background: SENTIMENT_POSITIVE }} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-4 text-[11.5px] text-ink-500">
              <Legend color={SENTIMENT_NEGATIVE} label={`Negative ${((negative / sentimentTotal) * 100).toFixed(0)}%`} />
              <Legend color={SENTIMENT_NEUTRAL} label={`Neutral ${((neutral / sentimentTotal) * 100).toFixed(0)}%`} />
              <Legend color={SENTIMENT_POSITIVE} label={`Positive ${((positive / sentimentTotal) * 100).toFixed(0)}%`} />
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-1 text-[19px] font-semibold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="text-[11px] text-ink-400">{hint}</p>}
    </Card>
  );
}
