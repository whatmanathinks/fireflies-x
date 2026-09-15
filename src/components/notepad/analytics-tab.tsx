"use client";

import { Gauge, MessageCircleQuestion, Mic, Timer } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/primitives";
import type { SpeakerAnalytics } from "@/db/schema";
import { cn, formatDuration, formatTimecode } from "@/lib/utils";
import {
  seriesColor,
  SENTIMENT_NEGATIVE as NEGATIVE,
  SENTIMENT_NEUTRAL as NEUTRAL,
  SENTIMENT_POSITIVE as POSITIVE,
} from "@/lib/viz";


export type AnalyticsData = {
  positivePct: number;
  neutralPct: number;
  negativePct: number;
  talkTimeMs: number;
  silenceMs: number;
  questionCount: number;
  taskCount: number;
  speakers: SpeakerAnalytics[];
};

export function AnalyticsTab({
  analytics,
  durationMs,
}: {
  analytics: AnalyticsData | null;
  durationMs: number;
}) {
  if (!analytics || analytics.speakers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="max-w-xs text-[13px] leading-relaxed text-ink-500">
          Conversation analytics appear once this meeting has been transcribed.
        </p>
      </div>
    );
  }

  const speakers = [...analytics.speakers].sort((a, b) => b.durationMs - a.durationMs);
  const totalTalk = speakers.reduce((acc, s) => acc + s.durationMs, 0) || 1;
  const maxWpm = Math.max(...speakers.map((s) => s.wordsPerMinute), 1);

  return (
    <div className="scrollbar-thin h-full space-y-6 overflow-y-auto px-4 py-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat icon={Timer} label="Duration" value={formatDuration(durationMs)} />
        <Stat
          icon={Mic}
          label="Talk time"
          value={`${Math.round((analytics.talkTimeMs / Math.max(1, durationMs)) * 100)}%`}
          hint={`${formatDuration(analytics.talkTimeMs)} of speech`}
        />
        <Stat icon={MessageCircleQuestion} label="Questions" value={String(analytics.questionCount)} />
        <Stat icon={Gauge} label="Speakers" value={String(speakers.length)} />
      </div>

      <section>
        <SectionLabel className="mb-2.5">Talk time</SectionLabel>

        <div className="flex h-7 w-full overflow-hidden rounded-md" role="img" aria-label="Talk time share by speaker">
          {speakers.map((s, i) => {
            const pct = (s.durationMs / totalTalk) * 100;
            return (
              <Tooltip
                key={s.speakerIndex}
                content={`${s.name} — ${pct.toFixed(1)}% (${formatDuration(s.durationMs)})`}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    background: seriesColor(s.speakerIndex),
                    marginRight: i < speakers.length - 1 ? 2 : 0,
                  }}
                />
              </Tooltip>
            );
          })}
        </div>

        <div className="mt-3 space-y-2">
          {speakers.map((s) => {
            const pct = (s.durationMs / totalTalk) * 100;
            return (
              <div key={s.speakerIndex} className="flex items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ background: seriesColor(s.speakerIndex) }}
                />
                <span className="w-32 shrink-0 truncate text-[12.5px] font-medium text-ink-800">
                  {s.name}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: seriesColor(s.speakerIndex) }}
                  />
                </div>
                <span className="w-11 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink-600">
                  {pct.toFixed(0)}%
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-400">
                  {formatDuration(s.durationMs)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionLabel className="mb-2.5">Sentiment</SectionLabel>
        <DivergingSentiment
          positive={analytics.positivePct}
          neutral={analytics.neutralPct}
          negative={analytics.negativePct}
        />
        <div className="mt-2.5 flex items-center gap-4 text-[11.5px] text-ink-500">
          <LegendDot color={NEGATIVE} label={`Negative ${analytics.negativePct.toFixed(0)}%`} />
          <LegendDot color={NEUTRAL} label={`Neutral ${analytics.neutralPct.toFixed(0)}%`} />
          <LegendDot color={POSITIVE} label={`Positive ${analytics.positivePct.toFixed(0)}%`} />
        </div>
      </section>

      <section>
        <SectionLabel className="mb-2.5">Speaking style</SectionLabel>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-400">
                <th className="px-3 py-2 font-semibold">Speaker</th>
                <th className="px-2 py-2 text-right font-semibold">Words</th>
                <th className="px-2 py-2 text-right font-semibold">WPM</th>
                <th className="px-2 py-2 text-right font-semibold">Fillers</th>
                <th className="px-2 py-2 text-right font-semibold">Questions</th>
                <th className="px-3 py-2 text-right font-semibold">Longest</th>
              </tr>
            </thead>
            <tbody>
              {speakers.map((s) => (
                <tr key={s.speakerIndex} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-sm"
                        style={{ background: seriesColor(s.speakerIndex) }}
                      />
                      <span className="truncate font-medium text-ink-800">{s.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-ink-600">
                    {s.wordCount.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span
                        className="h-1 rounded-full bg-ink-200"
                        style={{ width: `${Math.max(6, (s.wordsPerMinute / maxWpm) * 36)}px` }}
                      />
                      <span className="w-7 font-mono tabular-nums text-ink-600">
                        {s.wordsPerMinute}
                      </span>
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      s.fillerWords > s.wordCount * 0.04 ? "text-amber-700" : "text-ink-600",
                    )}
                  >
                    {s.fillerWords}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-ink-600">
                    {s.questions}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-600">
                    {formatTimecode(s.longestMonologueMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          Computed directly from word timings — not estimated by a model. Fillers counts
          hedges and discourse markers (&ldquo;um&rdquo;, &ldquo;you know&rdquo;, &ldquo;sort
          of&rdquo;); highlighted above 4% of a speaker&rsquo;s words.
        </p>
      </section>
    </div>
  );
}

function DivergingSentiment({
  positive,
  neutral,
  negative,
}: {
  positive: number;
  neutral: number;
  negative: number;
}) {
  const total = Math.max(1, positive + neutral + negative);
  const neg = (negative / total) * 100;
  const neu = (neutral / total) * 100;
  const pos = (positive / total) * 100;

  const leftWidth = neg + neu / 2;
  const scale = 100 / Math.max(leftWidth, pos + neu / 2, 1) / 2;

  return (
    <div className="relative h-7 w-full">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-300" />
      <div className="flex h-full items-stretch">
        <div className="flex flex-1 justify-end">
          <Tooltip content={`Negative ${negative.toFixed(1)}%`}>
            <div
              className="h-full rounded-l-md"
              style={{ width: `${neg * scale * 2}%`, background: NEGATIVE, marginRight: 2 }}
            />
          </Tooltip>
          <div
            className="h-full"
            style={{ width: `${(neu / 2) * scale * 2}%`, background: NEUTRAL }}
          />
        </div>
        <div className="flex flex-1">
          <div
            className="h-full"
            style={{ width: `${(neu / 2) * scale * 2}%`, background: NEUTRAL, marginRight: 2 }}
          />
          <Tooltip content={`Positive ${positive.toFixed(1)}%`}>
            <div
              className="h-full rounded-r-md"
              style={{ width: `${pos * scale * 2}%`, background: POSITIVE }}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
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
    <Card className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-1 text-[17px] font-semibold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="text-[11px] text-ink-400">{hint}</p>}
    </Card>
  );
}
