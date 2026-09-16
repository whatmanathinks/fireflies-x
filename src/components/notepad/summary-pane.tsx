"use client";

import {
  Check,
  ChevronDown,
  Copy,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, SectionLabel } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import type { ActionItem, Chapter } from "@/db/schema";
import { TEMPLATES, templateById } from "@/lib/ai/templates";
import { cn, formatTimecode } from "@/lib/utils";
import { usePlayback } from "./playback";

export type SummaryData = {
  template: string;
  keywords: string[];
  actionItems: ActionItem[];
  outline: Chapter[];
  shorthandBullet: string[];
  overview: string;
  bulletGist: string[];
  gist: string;
  shortSummary: string;
  meetingType: string;
  topicsDiscussed: string[];
  notes: string;
  generatedAt: Date;
};

export function SummaryPane({
  meetingId,
  summary,
  status,
  provider,
  progressNote,
  onSeekSentence,
}: {
  meetingId: string;
  summary: SummaryData | null;
  status: string;
  provider: string;
  progressNote: string | null;
  onSeekSentence: (index: number | null) => void;
}) {
  const { seek } = usePlayback();
  const [regenerating, setRegenerating] = useState(false);

  async function regenerate(template: string) {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not regenerate");
      toast.success("Regenerating notes…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not regenerate");
      setRegenerating(false);
    }
  }

  if (!summary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        {status === "failed" ? (
          <>
            <p className="text-[14px] font-semibold text-ink-800">Notes could not be generated</p>
            <Button variant="secondary" onClick={() => regenerate("general")}>
              <RefreshCw />
              Try again
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="size-5 animate-spin text-brand-500" />
            <p className="text-[14px] font-semibold text-ink-800">Writing your notes…</p>
            <p className="max-w-xs text-[12.5px] leading-relaxed text-ink-500">
              {progressNote
                ? `${progressNote}. Long meetings are read in sections and merged.`
                : `${provider} is reading the transcript to produce an overview, chapters and action items.`}
            </p>
          </>
        )}
      </div>
    );
  }

  const template = templateById(summary.template);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <Sparkles className="size-3.5 text-brand-600" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-semibold text-ink-900 hover:bg-ink-100">
              {template.label}
              <ChevronDown className="size-3.5 text-ink-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Rewrite notes as</DropdownMenuLabel>
            {TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => regenerate(t.id)}>
                <div className="flex-1">
                  <div className={cn(t.id === summary.template && "font-semibold text-brand-700")}>
                    {t.label}
                  </div>
                  <div className="text-[11.5px] text-ink-400">{t.description}</div>
                </div>
                {t.id === summary.template && <Check className="text-brand-600" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="flex-1" />
        {regenerating && <Loader2 className="size-3.5 animate-spin text-ink-400" />}
        <Tooltip content="Regenerate these notes">
          <Button
            variant="ghost"
            size="iconSm"
            disabled={regenerating}
            onClick={() => regenerate(summary.template)}
          >
            <RefreshCw />
          </Button>
        </Tooltip>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {summary.gist && (
          <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-[13.5px] font-medium leading-relaxed text-brand-900">
            {summary.gist}
          </p>
        )}

        {summary.keywords.length > 0 && (
          <Section title="Keywords" copyText={summary.keywords.join(", ")}>
            <div className="flex flex-wrap gap-1.5">
              {summary.keywords.map((k) => (
                <Badge key={k} tone="outline" className="px-2 py-1 text-[11.5px]">
                  {k}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {summary.bulletGist.length > 0 && (
          <Section title="Key takeaways" copyText={summary.bulletGist.map((b) => `• ${b}`).join("\n")}>
            <ul className="space-y-1.5">
              {summary.bulletGist.map((b, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-800">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-brand-500" />
                  {b}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {summary.overview && (
          <Section title="Overview" copyText={summary.overview}>
            <div className="space-y-2.5">
              {summary.overview.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="text-[13.5px] leading-[1.7] text-ink-700">
                  {p}
                </p>
              ))}
            </div>
          </Section>
        )}

        {summary.outline.length > 0 && (
          <Section
            title="Outline"
            copyText={summary.outline
              .map((c) => `${formatTimecode(c.startMs)} — ${c.title}\n${c.summary}`)
              .join("\n\n")}
          >
            <ol className="space-y-2.5">
              {summary.outline.map((chapter, i) => (
                <li key={i} className="group flex gap-2.5">
                  <button
                    onClick={() => seek(chapter.startMs)}
                    className="mt-px w-12 shrink-0 rounded px-1 py-px text-left font-mono text-[11px] text-ink-400 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {formatTimecode(chapter.startMs)}
                  </button>
                  <div className="min-w-0">
                    <button
                      onClick={() => seek(chapter.startMs)}
                      className="text-left text-[13px] font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {chapter.title}
                    </button>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
                      {chapter.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {summary.actionItems.length > 0 && (
          <Section
            title={`Action items · ${summary.actionItems.length}`}
            copyText={summary.actionItems
              .map((a) => `• ${a.text}${a.assignee ? ` (${a.assignee})` : ""}${a.dueDate ? ` — ${a.dueDate}` : ""}`)
              .join("\n")}
          >
            <div className="space-y-1.5">
              {summary.actionItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => onSeekSentence(item.sentenceIndex)}
                  className="flex w-full gap-2.5 rounded-lg border border-line px-2.5 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <ListChecks className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-ink-800">{item.text}</p>
                    {(item.assignee || item.dueDate) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {item.assignee && <Badge tone="brand">{item.assignee}</Badge>}
                        {item.dueDate && <Badge tone="amber">{item.dueDate}</Badge>}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {summary.shorthandBullet.length > 0 && (
          <Section title="Shorthand notes" copyText={summary.shorthandBullet.map((b) => `- ${b}`).join("\n")}>
            <ul className="space-y-1">
              {summary.shorthandBullet.map((b, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-600">
                  <span className="text-ink-300">–</span>
                  {b}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="pt-1 text-[11px] text-ink-400">
          Generated {new Date(summary.generatedAt).toLocaleString()} · {summary.meetingType}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="group">
      <div className="mb-2 flex items-center gap-2">
        <SectionLabel>{title}</SectionLabel>
        {copyText && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(copyText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            className="opacity-0 transition group-hover:opacity-100"
          >
            {copied ? (
              <Check className="size-3 text-emerald-600" />
            ) : (
              <Copy className="size-3 text-ink-400 hover:text-ink-700" />
            )}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function AddNoteButton() {
  return (
    <Button variant="ghost" size="sm">
      <Plus />
      Add note
    </Button>
  );
}
