"use client";

import {
  Bookmark,
  Check,
  ListTree,
  MessageSquare,
  Plus,
  Scissors,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, Input, Textarea } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/primitives";
import type { Chapter } from "@/db/schema";
import { cn, formatTimecode } from "@/lib/utils";
import { usePlayback } from "./playback";
import type { TranscriptSentence } from "./transcript-pane";

export type RailKey = "search" | "index" | "bites" | "comments" | "bookmarks";

export type BiteRow = { id: string; name: string; startMs: number; endMs: number; shareToken: string };
export type CommentRow = {
  id: string;
  parentId: string | null;
  authorName: string;
  body: string;
  timeMs: number | null;
  createdAt: Date | string;
};
export type BookmarkRow = { id: string; label: string; timeMs: number };

export const RAIL_ITEMS: { key: RailKey; label: string; icon: React.ElementType }[] = [
  { key: "search", label: "Smart Search", icon: Search },
  { key: "index", label: "Index", icon: ListTree },
  { key: "bites", label: "Soundbites", icon: Scissors },
  { key: "comments", label: "Comments", icon: MessageSquare },
  { key: "bookmarks", label: "Bookmarks", icon: Bookmark },
];

export function IconRail({
  active,
  counts,
  onSelect,
}: {
  active: RailKey | null;
  counts: Partial<Record<RailKey, number>>;
  onSelect: (key: RailKey | null) => void;
}) {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-white py-3">
      {RAIL_ITEMS.map(({ key, label, icon: Icon }) => {
        const count = counts[key];
        return (
          <Tooltip key={key} side="right" content={label}>
            <button
              onClick={() => onSelect(active === key ? null : key)}
              className={cn(
                "relative flex size-8 items-center justify-center rounded-lg transition-colors",
                active === key
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-400 hover:bg-ink-100 hover:text-ink-700",
              )}
            >
              <Icon className="size-4" />
              {!!count && (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                  {count}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function SidePanel({
  panel,
  meetingId,
  sentences,
  outline,
  bites,
  comments,
  bookmarks,
  selection,
  onClose,
  onRefresh,
}: {
  panel: RailKey;
  meetingId: string;
  sentences: TranscriptSentence[];
  outline: Chapter[];
  bites: BiteRow[];
  comments: CommentRow[];
  bookmarks: BookmarkRow[];
  selection: { startMs: number; endMs: number; text: string } | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const title = RAIL_ITEMS.find((i) => i.key === panel)?.label ?? "";

  return (
    <aside className="flex w-[19rem] shrink-0 flex-col border-r border-line bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink-900">{title}</h2>
        <span className="flex-1" />
        <Button variant="ghost" size="iconSm" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {panel === "search" && <SmartSearchPanel sentences={sentences} />}
        {panel === "index" && <IndexPanel outline={outline} sentences={sentences} />}
        {panel === "bites" && (
          <BitesPanel
            meetingId={meetingId}
            bites={bites}
            selection={selection}
            onRefresh={onRefresh}
          />
        )}
        {panel === "comments" && (
          <CommentsPanel meetingId={meetingId} comments={comments} onRefresh={onRefresh} />
        )}
        {panel === "bookmarks" && (
          <BookmarksPanel meetingId={meetingId} bookmarks={bookmarks} onRefresh={onRefresh} />
        )}
      </div>
    </aside>
  );
}

const SMART_FILTERS = [
  { key: "task", label: "Tasks" },
  { key: "question", label: "Questions" },
  { key: "metric", label: "Metrics" },
  { key: "pricing", label: "Pricing" },
  { key: "date_and_time", label: "Dates" },
] as const;

function SmartSearchPanel({ sentences }: { sentences: TranscriptSentence[] }) {
  const { seek } = usePlayback();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof SMART_FILTERS)[number]["key"] | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sentences.filter((s) => {
      if (filter && !s.aiFilters?.[filter]) return false;
      if (q && !s.text.toLowerCase().includes(q)) return false;
      return !!q || !!filter;
    });
  }, [sentences, query, filter]);

  return (
    <div className="p-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this transcript…"
        className="mb-2.5"
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SMART_FILTERS.map((f) => {
          const count = sentences.filter((s) => s.aiFilters?.[f.key]).length;
          return (
            <button
              key={f.key}
              disabled={count === 0}
              onClick={() => setFilter(filter === f.key ? null : f.key)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11.5px] font-medium transition disabled:opacity-35",
                filter === f.key
                  ? "bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-200",
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {results.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12.5px] leading-relaxed text-ink-400">
          {query || filter
            ? "No matching moments."
            : "Search, or pick a filter to pull out every task, question, metric, price or date."}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="px-1 text-[11px] text-ink-400">{results.length} moments</p>
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => seek(s.startMs)}
              className="w-full rounded-lg border border-line px-2.5 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
            >
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="font-mono text-[10.5px] text-ink-400">
                  {formatTimecode(s.startMs)}
                </span>
                <span className="truncate text-[11px] font-medium text-ink-500">
                  {s.speakerName}
                </span>
              </div>
              <p className="line-clamp-3 text-[12.5px] leading-relaxed text-ink-700">{s.text}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IndexPanel({
  outline,
  sentences,
}: {
  outline: Chapter[];
  sentences: TranscriptSentence[];
}) {
  const { seek, currentMs } = usePlayback();
  const tasks = sentences.filter((s) => s.aiFilters?.task);

  if (outline.length === 0 && tasks.length === 0) {
    return (
      <EmptyState icon={ListTree} title="No index yet" description="Chapters appear once notes are generated." />
    );
  }

  return (
    <div className="space-y-5 p-3">
      {outline.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Chapters
          </p>
          <div className="space-y-0.5">
            {outline.map((chapter, i) => {
              const next = outline[i + 1]?.startMs ?? Infinity;
              const active = currentMs >= chapter.startMs && currentMs < next;
              return (
                <button
                  key={i}
                  onClick={() => seek(chapter.startMs)}
                  className={cn(
                    "flex w-full gap-2 rounded-lg px-2 py-1.5 text-left transition",
                    active ? "bg-brand-50" : "hover:bg-ink-50",
                  )}
                >
                  <span className="mt-px shrink-0 font-mono text-[10.5px] text-ink-400">
                    {formatTimecode(chapter.startMs)}
                  </span>
                  <span
                    className={cn(
                      "text-[12.5px] leading-snug",
                      active ? "font-semibold text-brand-800" : "text-ink-700",
                    )}
                  >
                    {chapter.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Action moments
          </p>
          <div className="space-y-1">
            {tasks.map((s) => (
              <button
                key={s.id}
                onClick={() => seek(s.startMs)}
                className="flex w-full gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50"
              >
                <span className="mt-px shrink-0 font-mono text-[10.5px] text-ink-400">
                  {formatTimecode(s.startMs)}
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-700">
                  {s.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BitesPanel({
  meetingId,
  bites,
  selection,
  onRefresh,
}: {
  meetingId: string;
  bites: BiteRow[];
  selection: { startMs: number; endMs: number; text: string } | null;
  onRefresh: () => void;
}) {
  const { seek } = usePlayback();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function create() {
    if (!selection) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/bites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selection.text.slice(0, 70),
          startMs: selection.startMs,
          endMs: selection.endMs,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create soundbite");
      toast.success("Soundbite created");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create soundbite");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/meetings/${meetingId}/bites?biteId=${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="p-3">
      {selection ? (
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            Selected {formatTimecode(selection.startMs)} – {formatTimecode(selection.endMs)}
          </p>
          <p className="mb-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink-700">
            &ldquo;{selection.text}&rdquo;
          </p>
          <Button variant="primary" size="sm" disabled={busy} onClick={create}>
            <Plus />
            Create soundbite
          </Button>
        </div>
      ) : (
        <p className="mb-3 rounded-lg bg-ink-50 px-2.5 py-2 text-[12px] leading-relaxed text-ink-500">
          Select text in the transcript to clip that moment into a shareable soundbite.
        </p>
      )}

      {bites.length === 0 ? (
        <EmptyState icon={Scissors} title="No soundbites yet" />
      ) : (
        <div className="space-y-1.5">
          {bites.map((bite) => (
            <div
              key={bite.id}
              className="group rounded-lg border border-line px-2.5 py-2 transition hover:border-brand-300"
            >
              <button onClick={() => seek(bite.startMs)} className="block w-full text-left">
                <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-800">
                  {bite.name}
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] text-ink-400">
                  {formatTimecode(bite.startMs)} – {formatTimecode(bite.endMs)}
                </p>
              </button>
              <div className="mt-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/bite/${bite.shareToken}`,
                    );
                    setCopied(bite.id);
                    setTimeout(() => setCopied(null), 1400);
                  }}
                >
                  {copied === bite.id ? <Check /> : <Send />}
                  {copied === bite.id ? "Copied" : "Share"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(bite.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentsPanel({
  meetingId,
  comments,
  onRefresh,
}: {
  meetingId: string;
  comments: CommentRow[];
  onRefresh: () => void;
}) {
  const { currentMs, seek } = usePlayback();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const roots = comments.filter((c) => !c.parentId);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          timeMs: replyTo ? null : Math.round(currentMs),
          parentId: replyTo,
        }),
      });
      if (!res.ok) throw new Error("Could not post comment");
      setBody("");
      setReplyTo(null);
      onRefresh();
    } catch {
      toast.error("Could not post comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 p-3">
        {roots.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No comments"
            description="Comments are pinned to the moment you were at when you wrote them."
          />
        ) : (
          roots.map((comment) => {
            const replies = comments.filter((c) => c.parentId === comment.id);
            return (
              <div key={comment.id} className="rounded-lg border border-line p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <Avatar name={comment.authorName} size={18} />
                  <span className="text-[12px] font-semibold text-ink-800">
                    {comment.authorName}
                  </span>
                  {comment.timeMs !== null && (
                    <button
                      onClick={() => seek(comment.timeMs!)}
                      className="font-mono text-[10.5px] text-brand-600 hover:underline"
                    >
                      {formatTimecode(comment.timeMs)}
                    </button>
                  )}
                </div>
                <p className="text-[12.5px] leading-relaxed text-ink-700">{comment.body}</p>

                {replies.length > 0 && (
                  <div className="mt-2 space-y-2 border-l-2 border-line pl-2.5">
                    {replies.map((reply) => (
                      <div key={reply.id}>
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <Avatar name={reply.authorName} size={16} />
                          <span className="text-[11.5px] font-semibold text-ink-700">
                            {reply.authorName}
                          </span>
                        </div>
                        <p className="text-[12px] leading-relaxed text-ink-600">{reply.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                  className="mt-1.5 text-[11.5px] font-medium text-ink-400 hover:text-brand-600"
                >
                  {replyTo === comment.id ? "Cancel reply" : "Reply"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-line p-2.5">
        {replyTo && (
          <p className="mb-1.5 flex items-center gap-1 text-[11px] text-ink-400">
            Replying in thread
            <button onClick={() => setReplyTo(null)}>
              <X className="size-3" />
            </button>
          </p>
        )}
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyTo ? "Write a reply…" : `Comment at ${formatTimecode(currentMs)}…`}
          className="mb-1.5 text-[12.5px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          disabled={!body.trim() || busy}
          onClick={submit}
        >
          <Send />
          Post
        </Button>
      </div>
    </div>
  );
}

function BookmarksPanel({
  meetingId,
  bookmarks,
  onRefresh,
}: {
  meetingId: string;
  bookmarks: BookmarkRow[];
  onRefresh: () => void;
}) {
  const { currentMs, seek } = usePlayback();
  const [label, setLabel] = useState("");

  async function add() {
    const res = await fetch(`/api/meetings/${meetingId}/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim() || `Bookmark at ${formatTimecode(currentMs)}`,
        timeMs: Math.round(currentMs),
      }),
    });
    if (res.ok) {
      setLabel("");
      onRefresh();
    } else toast.error("Could not add bookmark");
  }

  async function remove(id: string) {
    await fetch(`/api/meetings/${meetingId}/bookmarks?bookmarkId=${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="p-3">
      <div className="mb-3 flex gap-1.5">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`Mark ${formatTimecode(currentMs)}`}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="primary" size="icon" onClick={add}>
          <Plus />
        </Button>
      </div>

      {bookmarks.length === 0 ? (
        <EmptyState icon={Bookmark} title="No bookmarks" />
      ) : (
        <div className="space-y-1">
          {bookmarks.map((b) => (
            <div key={b.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-50">
              <button onClick={() => seek(b.timeMs)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[12.5px] text-ink-800">{b.label}</p>
                <p className="font-mono text-[10.5px] text-ink-400">{formatTimecode(b.timeMs)}</p>
              </button>
              <button
                onClick={() => remove(b.id)}
                className="opacity-0 transition group-hover:opacity-100"
              >
                <Trash2 className="size-3.5 text-ink-400 hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status, botState }: { status: string; botState: string }) {
  if (status === "completed") return null;
  const tone =
    status === "failed" ? "red" : status === "recording" || botState === "in_call" ? "green" : "amber";
  return <Badge tone={tone}>{status}</Badge>;
}
