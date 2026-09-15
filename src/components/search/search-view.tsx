"use client";

import {
  CalendarClock,
  CircleDollarSign,
  HelpCircle,
  ListChecks,
  Quote,
  Search,
  Sigma,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, EmptyState, Input, SectionLabel } from "@/components/ui/misc";
import { cn, formatTimecode } from "@/lib/utils";

type Hit = {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  index: number;
  speakerName: string;
  text: string;
  startMs: number;
};

const FILTERS = [
  { key: "task", label: "Tasks", icon: ListChecks },
  { key: "question", label: "Questions", icon: HelpCircle },
  { key: "metric", label: "Metrics", icon: Sigma },
  { key: "pricing", label: "Pricing", icon: CircleDollarSign },
  { key: "date_and_time", label: "Dates", icon: CalendarClock },
] as const;

export function SearchView({
  query,
  filter,
  hits,
}: {
  query: string;
  filter: string | null;
  hits: Hit[];
}) {
  const router = useRouter();
  const [input, setInput] = useState(query);

  const grouped = new Map<string, Hit[]>();
  for (const hit of hits) {
    grouped.set(hit.meetingId, [...(grouped.get(hit.meetingId) ?? []), hit]);
  }

  function submit(next: string) {
    router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  }

  function highlight(text: string) {
    const terms = query
      .split(/\s+/)
      .map((t) => t.replace(/[^\w']/g, ""))
      .filter((t) => t.length > 2);
    if (!terms.length) return text;
    const pattern = new RegExp(`(${terms.join("|")})`, "gi");
    return text.split(pattern).map((part, i) =>
      terms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
        <mark key={i} className="rounded bg-amber-100 px-0.5 text-ink-900">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Smart Search</h1>
        <p className="mt-1 text-[13.5px] text-ink-500">
          Full-text search across every transcript, or pull out one kind of moment across all
          meetings.
        </p>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(input)}
            placeholder="Search everything that was said…"
            className="h-10 pl-9 text-[14px]"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              href={filter === key ? "/search" : `/search?filter=${key}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium transition",
                filter === key
                  ? "bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-200",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
        </div>

        <div className="mt-6">
          {hits.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title={query || filter ? "No matching moments" : "Search your meetings"}
                description={
                  query || filter
                    ? "Try a different phrase, or pick one of the filters above."
                    : "Every sentence is indexed. Search for a phrase, or use a filter to see every task, question, metric, price or date across your workspace."
                }
              />
            </Card>
          ) : (
            <>
              <p className="mb-3 text-[12.5px] text-ink-500">
                {hits.length} {hits.length === 1 ? "moment" : "moments"} across {grouped.size}{" "}
                {grouped.size === 1 ? "meeting" : "meetings"}
              </p>
              <div className="space-y-5">
                {[...grouped.entries()].map(([meetingId, items]) => (
                  <section key={meetingId}>
                    <div className="mb-2 flex items-center gap-2">
                      <SectionLabel className="truncate">{items[0].meetingTitle}</SectionLabel>
                      <span className="text-[11px] text-ink-400">
                        {new Date(items[0].meetingDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <Card className="divide-y divide-line">
                      {items.map((hit) => (
                        <Link
                          key={`${hit.meetingId}-${hit.index}`}
                          href={`/meetings/${hit.meetingId}?t=${hit.startMs}`}
                          className="flex gap-3 px-3.5 py-2.5 transition hover:bg-ink-50"
                        >
                          <Quote className="mt-0.5 size-3.5 shrink-0 text-ink-300" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-relaxed text-ink-800">
                              {highlight(hit.text)}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-ink-400">
                              {hit.speakerName} · {formatTimecode(hit.startMs)}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </Card>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
