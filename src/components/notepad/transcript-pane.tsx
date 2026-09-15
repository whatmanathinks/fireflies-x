"use client";

import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Filter,
  HelpCircle,
  ListChecks,
  Pencil,
  Search,
  Sigma,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Input } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/primitives";
import type { AiFilters } from "@/db/schema";
import { cn, formatTimecode } from "@/lib/utils";
import { usePlayback } from "./playback";

export type TranscriptSentence = {
  id: string;
  index: number;
  speakerIndex: number;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
  aiFilters: AiFilters | null;
  edited: boolean;
};

export type SpeakerRow = {
  speakerIndex: number;
  label: string;
  displayName: string | null;
};

type FilterKey = "task" | "question" | "metric" | "pricing" | "date_and_time";

const FILTERS: { key: FilterKey; label: string; icon: React.ElementType; tone: string }[] = [
  { key: "task", label: "Tasks", icon: ListChecks, tone: "bg-brand-100 text-brand-800 ring-brand-300" },
  { key: "question", label: "Questions", icon: HelpCircle, tone: "bg-sky-100 text-sky-800 ring-sky-300" },
  { key: "metric", label: "Metrics", icon: Sigma, tone: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  { key: "pricing", label: "Pricing", icon: CircleDollarSign, tone: "bg-amber-100 text-amber-800 ring-amber-300" },
  { key: "date_and_time", label: "Dates", icon: CalendarClock, tone: "bg-violet-100 text-violet-800 ring-violet-300" },
];

export function TranscriptPane({
  meetingId,
  sentences,
  speakers,
  onSelectionChange,
  jumpTo,
}: {
  meetingId: string;
  sentences: TranscriptSentence[];
  speakers: SpeakerRow[];
  onSelectionChange: (range: { startMs: number; endMs: number; text: string } | null) => void;
  jumpTo: number | null;
}) {
  const { currentMs, seek } = usePlayback();
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [active, setActive] = useState<Set<FilterKey>>(new Set());
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [editing, setEditing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [names, setNames] = useState<Map<number, string>>(
    () => new Map(speakers.map((s) => [s.speakerIndex, s.displayName ?? s.label])),
  );
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  const rows = useMemo(
    () =>
      edits.size === 0
        ? sentences
        : sentences.map((s) =>
            edits.has(s.id) ? { ...s, text: edits.get(s.id)!, edited: true } : s,
          ),
    [sentences, edits],
  );

  const activeIndex = useMemo(() => {
    let found = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].startMs <= currentMs) found = i;
      else break;
    }
    return found;
  }, [currentMs, rows]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return rows.filter((r) => r.text.toLowerCase().includes(q)).map((r) => r.index);
  }, [query, rows]);

  const filterCounts = useMemo(() => {
    const counts = new Map<FilterKey, number>();
    for (const f of FILTERS) {
      counts.set(f.key, rows.filter((r) => r.aiFilters?.[f.key]).length);
    }
    return counts;
  }, [rows]);

  const matchesFilter = (row: TranscriptSentence) => {
    if (active.size === 0) return false;
    for (const key of active) if (row.aiFilters?.[key]) return true;
    return false;
  };

  const visible = useMemo(() => {
    if (!onlyMatches || active.size === 0) return rows;
    return rows.filter(matchesFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, onlyMatches, active]);

  const blocks = useMemo(() => {
    const out: { speakerIndex: number; startMs: number; items: TranscriptSentence[] }[] = [];
    for (const row of visible) {
      const last = out[out.length - 1];
      if (last && last.speakerIndex === row.speakerIndex && row.startMs - last.items[last.items.length - 1].endMs < 4000) {
        last.items.push(row);
      } else {
        out.push({ speakerIndex: row.speakerIndex, startMs: row.startMs, items: [row] });
      }
    }
    return out;
  }, [visible]);

  useEffect(() => {
    if (!autoScroll.current || activeIndex < 0 || editing) return;
    const node = scrollRef.current?.querySelector(`[data-sentence="${rows[activeIndex]?.index}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex, rows, editing]);

  useEffect(() => {
    if (jumpTo === null) return;
    const target = rows.find((r) => r.startMs >= jumpTo) ?? rows[rows.length - 1];
    if (!target) return;
    scrollRef.current
      ?.querySelector(`[data-sentence="${target.index}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [jumpTo, rows]);

  function handleMouseUp() {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 3) {
      onSelectionChange(null);
      return;
    }
    const container = scrollRef.current;
    if (!container || !selection?.anchorNode || !container.contains(selection.anchorNode)) return;

    const touched = rows.filter((r) => {
      const node = container.querySelector(`[data-sentence="${r.index}"]`);
      return node ? selection.containsNode(node, true) : false;
    });
    if (!touched.length) return;
    onSelectionChange({
      startMs: touched[0].startMs,
      endMs: touched[touched.length - 1].endMs,
      text,
    });
  }

  async function saveSentence(row: TranscriptSentence, text: string) {
    const next = text.trim();
    if (next === row.text.trim()) return;
    setEdits((prev) => new Map(prev).set(row.id, next));
    const res = await fetch(`/api/meetings/${meetingId}/transcript`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentenceId: row.id, text: next }),
    });
    if (!res.ok) toast.error("Could not save edit");
  }

  async function renameSpeaker(speakerIndex: number, displayName: string) {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setNames((prev) => new Map(prev).set(speakerIndex, trimmed));
    setRenaming(null);
    const res = await fetch(`/api/meetings/${meetingId}/transcript`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speakerIndex, displayName: trimmed }),
    });
    if (res.ok) toast.success(`Renamed to ${trimmed}`);
    else toast.error("Could not rename speaker");
  }

  function gotoMatch(delta: number) {
    if (!matches.length) return;
    const next = (matchCursor + delta + matches.length) % matches.length;
    setMatchCursor(next);
    const target = rows.find((r) => r.index === matches[next]);
    if (target) {
      autoScroll.current = false;
      scrollRef.current
        ?.querySelector(`[data-sentence="${target.index}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-ink-900">Transcript</h2>
          <Badge tone="neutral">{rows.length}</Badge>
          <span className="flex-1" />
          <Tooltip content="Find in transcript">
            <Button
              variant={finding ? "subtle" : "ghost"}
              size="iconSm"
              onClick={() => setFinding((v) => !v)}
            >
              <Search />
            </Button>
          </Tooltip>
          <Tooltip content={editing ? "Done editing" : "Edit transcript"}>
            <Button
              variant={editing ? "subtle" : "ghost"}
              size="iconSm"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? <Check /> : <Pencil />}
            </Button>
          </Tooltip>
        </div>

        {finding && (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={query}
              placeholder="Find…"
              className="h-7 text-[12.5px]"
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") gotoMatch(e.shiftKey ? -1 : 1);
                if (e.key === "Escape") setFinding(false);
              }}
            />
            <span className="w-16 shrink-0 text-center text-[11.5px] tabular-nums text-ink-400">
              {matches.length ? `${matchCursor + 1}/${matches.length}` : "0"}
            </span>
            <Button variant="ghost" size="iconSm" onClick={() => gotoMatch(-1)}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="iconSm" onClick={() => gotoMatch(1)}>
              <ChevronDown />
            </Button>
            <Button variant="ghost" size="iconSm" onClick={() => setFinding(false)}>
              <X />
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map(({ key, label, icon: Icon, tone }) => {
            const count = filterCounts.get(key) ?? 0;
            const on = active.has(key);
            return (
              <button
                key={key}
                disabled={count === 0}
                onClick={() =>
                  setActive((prev) => {
                    const next = new Set(prev);
                    next.has(key) ? next.delete(key) : next.add(key);
                    if (next.size === 0) setOnlyMatches(false);
                    return next;
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium transition disabled:opacity-35",
                  on ? `${tone} ring-1` : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                )}
              >
                <Icon className="size-3" />
                {label}
                <span className="tabular-nums opacity-60">{count}</span>
              </button>
            );
          })}
          {active.size > 0 && (
            <button
              onClick={() => setOnlyMatches((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium transition",
                onlyMatches
                  ? "bg-ink-900 text-white"
                  : "border border-line text-ink-500 hover:bg-ink-100",
              )}
            >
              <Filter className="size-3" />
              Only matches
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onMouseUp={handleMouseUp}
        onWheel={() => (autoScroll.current = false)}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {blocks.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-ink-400">
            No lines match the active filters.
          </p>
        ) : (
          <div className="space-y-4">
            {blocks.map((block, bi) => {
              const name = names.get(block.speakerIndex) ?? `Speaker ${block.speakerIndex + 1}`;
              return (
                <div key={`${block.speakerIndex}-${block.startMs}-${bi}`} className="group/block">
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar name={name} size={22} />
                    {renaming === block.speakerIndex ? (
                      <Input
                        autoFocus
                        value={renameValue}
                        className="h-6 w-44 text-[12.5px]"
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => renameSpeaker(block.speakerIndex, renameValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameSpeaker(block.speakerIndex, renameValue);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setRenaming(block.speakerIndex);
                          setRenameValue(name);
                        }}
                        className="text-[12.5px] font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                        title="Rename this speaker everywhere"
                      >
                        {name}
                      </button>
                    )}
                    <button
                      onClick={() => seek(block.startMs)}
                      className="font-mono text-[11px] text-ink-400 hover:text-brand-600"
                    >
                      {formatTimecode(block.startMs)}
                    </button>
                  </div>

                  <div className="ml-[30px] space-y-0.5">
                    {block.items.map((row) => {
                      const isActive = rows[activeIndex]?.index === row.index;
                      const hit = matchesFilter(row);
                      const isMatch = matches.includes(row.index);
                      return (
                        <p
                          key={row.id}
                          data-sentence={row.index}
                          onClick={() => !editing && seek(row.startMs)}
                          onBlur={(e) =>
                            editing && saveSentence(row, e.currentTarget.textContent ?? "")
                          }
                          contentEditable={editing}
                          suppressContentEditableWarning
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[13.5px] leading-[1.65] outline-none transition-colors",
                            editing
                              ? "cursor-text text-ink-800 focus:bg-brand-50 focus:ring-1 focus:ring-brand-300"
                              : "cursor-pointer text-ink-800 hover:bg-ink-50",
                            isActive && !editing && "bg-brand-50 text-ink-900",
                            hit && "ring-1 ring-inset ring-brand-200 bg-brand-50/50",
                            isMatch && "bg-amber-100",
                            active.size > 0 && !hit && !onlyMatches && "opacity-40",
                          )}
                        >
                          {row.text}
                          {row.edited && !editing && (
                            <span className="ml-1.5 align-middle text-[10px] text-ink-400">
                              edited
                            </span>
                          )}
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
