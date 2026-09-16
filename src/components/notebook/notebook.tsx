"use client";

import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Filter,
  FolderInput,
  Hash,
  Inbox,
  Lock,
  MonitorSpeaker,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AvatarStack,
  Badge,
  Checkbox,
  EmptyState,
  Input,
  SectionLabel,
} from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { STATUS_LABEL } from "@/lib/labels";
import { useHydrated } from "@/lib/use-hydrated";
import { cn, formatDuration } from "@/lib/utils";

export type MeetingRow = {
  id: string;
  title: string;
  date: string;
  durationMs: number;
  hostEmail: string;
  participants: string[];
  captureSource: string;
  status: string;
  isLive: boolean;
  privacy: string;
  ownerId: string;
  gist: string | null;
  shortSummary: string | null;
  keywords: string[] | null;
  channelIds: string[];
};

export type ChannelRow = {
  id: string;
  title: string;
  slug: string;
  isPrivate: boolean;
  count: number;
};

const SOURCE_META: Record<string, { icon: React.ElementType; label: string }> = {
  browser: { icon: MonitorSpeaker, label: "Browser recording" },
  upload: { icon: Upload, label: "Uploaded file" },
  bot_sim: { icon: Bot, label: "Notetaker bot" },
  seed: { icon: Users, label: "Sample meeting" },
};

const DURATIONS = [
  { label: "Any length", ms: 0 },
  { label: "Over 5 min", ms: 5 * 60_000 },
  { label: "Over 15 min", ms: 15 * 60_000 },
  { label: "Over 30 min", ms: 30 * 60_000 },
];

const RANGES = [
  { label: "All time", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export function Notebook({
  meetings,
  channels,
  currentUserId,
  currentUserEmail,
}: {
  meetings: MeetingRow[];
  channels: ChannelRow[];
  currentUserId: string;
  currentUserEmail: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [hostedByMe, setHostedByMe] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [minDuration, setMinDuration] = useState(0);
  const [rangeDays, setRangeDays] = useState(0);
  const [participant, setParticipant] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newChannel, setNewChannel] = useState("");
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());
  const hydrated = useHydrated();

  const allParticipants = useMemo(
    () => [...new Set(meetings.flatMap((m) => m.participants))].sort(),
    [meetings],
  );

  const filtered = useMemo(() => {
    const cutoff = rangeDays ? now - rangeDays * 86_400_000 : 0;
    const q = query.trim().toLowerCase();

    return meetings.filter((m) => {
      if (channel === "mine" && m.ownerId !== currentUserId) return false;
      if (channel === "uploads" && m.captureSource !== "upload") return false;
      if (channel !== "all" && channel !== "mine" && channel !== "uploads") {
        if (!m.channelIds.includes(channel)) return false;
      }
      if (hostedByMe && m.hostEmail !== currentUserEmail) return false;
      if (source && m.captureSource !== source) return false;
      if (minDuration && m.durationMs < minDuration) return false;
      if (cutoff && new Date(m.date).getTime() < cutoff) return false;
      if (participant && !m.participants.includes(participant)) return false;
      if (q) {
        const haystack = `${m.title} ${m.gist ?? ""} ${(m.keywords ?? []).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    meetings, channel, hostedByMe, source, minDuration, rangeDays, participant, query,
    currentUserId, currentUserEmail, now,
  ]);

  const grouped = useMemo(() => {
    const groups = new Map<string, MeetingRow[]>();
    for (const m of filtered) {
      const key = new Date(m.date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        ...(hydrated ? {} : { timeZone: "UTC" }),
      });
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return [...groups.entries()];
  }, [filtered, hydrated]);

  const activeFilterCount =
    (hostedByMe ? 1 : 0) + (source ? 1 : 0) + (minDuration ? 1 : 0) +
    (rangeDays ? 1 : 0) + (participant ? 1 : 0);

  const allSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((m) => m.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkMove(channelId: string) {
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/meetings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelIds: [channelId] }),
        }),
      ),
    );
    toast.success(`Moved ${ids.length} ${ids.length === 1 ? "meeting" : "meetings"}`);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "meeting" : "meetings"}?`)) return;
    await Promise.all(ids.map((id) => fetch(`/api/meetings/${id}`, { method: "DELETE" })));
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
    router.refresh();
  }

  async function createChannel() {
    if (!newChannel.trim()) return;
    setCreating(true);
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newChannel.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      setNewChannel("");
      router.refresh();
      toast.success("Channel created");
    } else toast.error("Could not create channel");
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-white">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
          <SectionLabel className="mb-1.5 px-2">Channels</SectionLabel>
          <ChannelButton
            icon={Inbox}
            label="All Meetings"
            count={meetings.length}
            active={channel === "all"}
            onClick={() => setChannel("all")}
          />
          <ChannelButton
            icon={User}
            label="My Meetings"
            count={meetings.filter((m) => m.ownerId === currentUserId).length}
            active={channel === "mine"}
            onClick={() => setChannel("mine")}
          />
          <ChannelButton
            icon={Upload}
            label="Uploads"
            count={meetings.filter((m) => m.captureSource === "upload").length}
            active={channel === "uploads"}
            onClick={() => setChannel("uploads")}
          />

          {channels.length > 0 && (
            <>
              <SectionLabel className="mb-1.5 mt-4 px-2">Your channels</SectionLabel>
              {channels.map((c) => (
                <ChannelButton
                  key={c.id}
                  icon={c.isPrivate ? Lock : Hash}
                  label={c.title}
                  count={c.count}
                  active={channel === c.id}
                  onClick={() => setChannel(c.id)}
                />
              ))}
            </>
          )}

          <div className="mt-3 flex gap-1 px-1">
            <Input
              value={newChannel}
              placeholder="New channel"
              className="h-7 text-[12px]"
              onChange={(e) => setNewChannel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createChannel()}
            />
            <Button
              variant="ghost"
              size="iconSm"
              disabled={!newChannel.trim() || creating}
              onClick={createChannel}
            >
              <Plus />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2.5">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter this channel…"
              className="pl-8"
            />
          </div>

          <button
            onClick={() => setHostedByMe((v) => !v)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[12px] font-medium transition",
              hostedByMe ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
            )}
          >
            Hosted by me
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant={activeFilterCount ? "subtle" : "ghost"} size="md">
                <Filter />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 space-y-3">
              <FilterRow label="Captured from">
                <select
                  value={source ?? ""}
                  onChange={(e) => setSource(e.target.value || null)}
                  className="h-7 w-full rounded-md border border-line bg-white px-1.5 text-[12px] outline-none"
                >
                  <option value="">Any source</option>
                  <option value="browser">Browser recording</option>
                  <option value="upload">Upload</option>
                  <option value="bot_sim">Notetaker bot</option>
                  <option value="seed">Sample</option>
                </select>
              </FilterRow>

              <FilterRow label="Duration">
                <select
                  value={minDuration}
                  onChange={(e) => setMinDuration(Number(e.target.value))}
                  className="h-7 w-full rounded-md border border-line bg-white px-1.5 text-[12px] outline-none"
                >
                  {DURATIONS.map((d) => (
                    <option key={d.ms} value={d.ms}>{d.label}</option>
                  ))}
                </select>
              </FilterRow>

              <FilterRow label="Date range">
                <select
                  value={rangeDays}
                  onChange={(e) => setRangeDays(Number(e.target.value))}
                  className="h-7 w-full rounded-md border border-line bg-white px-1.5 text-[12px] outline-none"
                >
                  {RANGES.map((r) => (
                    <option key={r.days} value={r.days}>{r.label}</option>
                  ))}
                </select>
              </FilterRow>

              <FilterRow label="Participant">
                <select
                  value={participant ?? ""}
                  onChange={(e) => setParticipant(e.target.value || null)}
                  className="h-7 w-full rounded-md border border-line bg-white px-1.5 text-[12px] outline-none"
                >
                  <option value="">Anyone</option>
                  {allParticipants.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </FilterRow>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setHostedByMe(false);
                    setSource(null);
                    setMinDuration(0);
                    setRangeDays(0);
                    setParticipant(null);
                  }}
                >
                  <X />
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>

          <span className="flex-1" />
          <span className="text-[12px] text-ink-400">
            {filtered.length} of {meetings.length}
          </span>
        </div>

        {selected.size > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-brand-50 px-4 py-2">
            <span className="text-[12.5px] font-medium text-brand-900">
              {selected.size} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <FolderInput />
                  Move to channel
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {channels.length === 0 && (
                  <DropdownMenuItem disabled>No channels yet</DropdownMenuItem>
                )}
                {channels.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => bulkMove(c.id)}>
                    {c.isPrivate ? <Lock /> : <Hash />}
                    {c.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="danger" size="sm" onClick={bulkDelete}>
              <Trash2 />
              Delete
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X />
              Clear
            </Button>
          </div>
        )}

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No meetings here"
              description={
                meetings.length === 0
                  ? "Record a call, upload a file, or send the notetaker to a live meeting to get started."
                  : "Nothing matches the current channel and filters."
              }
            />
          ) : (
            <>
              <div className="flex items-center gap-2.5 border-b border-line px-4 py-1.5">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
                <span className="text-[11.5px] text-ink-400">Select all</span>
              </div>

              {grouped.map(([day, rows]) => (
                <section key={day}>
                  <div className="sticky top-0 z-10 border-b border-line bg-canvas/90 px-4 py-1.5 backdrop-blur">
                    <SectionLabel suppressHydrationWarning>{day}</SectionLabel>
                  </div>
                  {rows.map((m) => (
                    <MeetingListRow
                      key={m.id}
                      meeting={m}
                      channels={channels}
                      selected={selected.has(m.id)}
                      onToggle={() => toggleOne(m.id)}
                      onRefresh={() => router.refresh()}
                    />
                  ))}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function ChannelButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition",
        active ? "bg-brand-50 font-medium text-brand-800" : "text-ink-600 hover:bg-ink-100",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", active ? "text-brand-600" : "text-ink-400")} />
      <span className="flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{count}</span>
    </button>
  );
}

function MeetingListRow({
  meeting,
  channels,
  selected,
  onToggle,
  onRefresh,
}: {
  meeting: MeetingRow;
  channels: ChannelRow[];
  selected: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const meta = SOURCE_META[meeting.captureSource] ?? SOURCE_META.seed;
  const SourceIcon = meta.icon;
  const [copied, setCopied] = useState(false);

  async function move(channelId: string) {
    await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: [channelId] }),
    });
    toast.success("Moved");
    onRefresh();
  }

  async function remove() {
    if (!confirm(`Delete "${meeting.title}"?`)) return;
    await fetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
    toast.success("Deleted");
    onRefresh();
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 border-b border-line px-4 py-3 transition",
        selected ? "bg-brand-50/60" : "hover:bg-white",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="mt-1"
        aria-label={`Select ${meeting.title}`}
      />

      <Tooltip content={meta.label}>
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
          <SourceIcon className="size-3.5" />
        </span>
      </Tooltip>

      <Link href={`/meetings/${meeting.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-semibold text-ink-900 group-hover:text-brand-700">
            {meeting.title}
          </p>
          {meeting.isLive && (
            <Badge tone="green">
              <span className="live-dot size-1.5 rounded-full bg-emerald-500" />
              Live
            </Badge>
          )}
          {meeting.status !== "completed" && !meeting.isLive && (
            <Badge tone={meeting.status === "failed" ? "red" : "amber"}>
              {STATUS_LABEL[meeting.status] ?? meeting.status}
            </Badge>
          )}
          {meeting.privacy === "public" && <Badge tone="brand">Shared</Badge>}
        </div>

        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-400">
          <span suppressHydrationWarning>
            {new Date(meeting.date).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <Clock className="size-3" />
          <span>{formatDuration(meeting.durationMs)}</span>
          <span className="truncate">· {meeting.hostEmail}</span>
        </div>

        {meeting.shortSummary && (
          <p className="mt-1 line-clamp-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-500">
            {meeting.shortSummary}
          </p>
        )}

        {meeting.keywords && meeting.keywords.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {meeting.keywords.slice(0, 5).map((k) => (
              <Badge key={k} tone="neutral" className="text-[10.5px]">
                {k}
              </Badge>
            ))}
          </div>
        )}
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <AvatarStack names={meeting.participants.map((p) => p.split("@")[0])} size={22} max={3} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" className="opacity-0 group-hover:opacity-100">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/meetings/${meeting.id}`,
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
                toast.success("Link copied");
              }}
            >
              {copied ? <Check /> : <Users />}
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/api/meetings/${meeting.id}/export?format=md`} download>
                <Upload className="rotate-180" />
                Download notes
              </a>
            </DropdownMenuItem>
            {channels.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Move to channel</DropdownMenuLabel>
                {channels.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => move(c.id)}>
                    {c.isPrivate ? <Lock /> : <Hash />}
                    {c.title}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={remove}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
