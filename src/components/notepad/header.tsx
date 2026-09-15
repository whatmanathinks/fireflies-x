"use client";

import {
  ArrowLeft,
  Bot,
  Check,
  Download,
  Globe,
  Link2,
  Lock,
  MonitorSpeaker,
  MoreHorizontal,
  Share2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MeetingInfoDialog } from "@/components/notepad/meeting-info-dialog";
import { ShareDialog } from "@/components/notepad/share-dialog";
import { Button } from "@/components/ui/button";
import { AvatarStack, Badge } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { BOT_STATE_LABEL } from "@/lib/labels";
import { formatDuration } from "@/lib/utils";

const SOURCE_ICON: Record<string, React.ElementType> = {
  browser: MonitorSpeaker,
  upload: Upload,
  bot_sim: Bot,
  seed: Users,
};

export type MeetingHeaderData = {
  id: string;
  title: string;
  date: Date | string;
  durationMs: number;
  participants: string[];
  invited: string[];
  attendance: { name: string; joinMs: number; leaveMs: number }[];
  privacy: string;
  captureSource: string;
  status: string;
  botState: string;
  isLive: boolean;
  meetingLink: string | null;
  audioUrl: string | null;
  hostEmail: string;
  channels: { id: string; title: string; isPrivate: boolean }[];
};

export function NotepadHeader({ meeting }: { meeting: MeetingHeaderData }) {
  const router = useRouter();
  const [title, setTitle] = useState(meeting.title);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const SourceIcon = SOURCE_ICON[meeting.captureSource] ?? Users;

  async function saveTitle(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === meeting.title) {
      setTitle(meeting.title);
      return;
    }
    const res = await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (res.ok) {
      toast.success("Renamed");
      router.refresh();
    } else {
      toast.error("Could not rename");
      setTitle(meeting.title);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${meeting.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Meeting deleted");
      router.push("/meetings");
    } else toast.error("Could not delete");
  }

  const names = meeting.attendance.length
    ? meeting.attendance.map((a) => a.name)
    : meeting.participants.map((p) => p.split("@")[0]);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-4 py-2.5">
      <Tooltip content="Back to meetings">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/meetings">
            <ArrowLeft />
          </Link>
        </Button>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => saveTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(meeting.title);
                e.currentTarget.blur();
              }
            }}
            className="min-w-0 max-w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-semibold text-ink-900 outline-none hover:border-line focus:border-brand-400 focus:bg-white"
            style={{ width: `${Math.min(52, Math.max(12, title.length + 1))}ch` }}
          />
          {meeting.isLive && (
            <Badge tone="green">
              <span className="live-dot size-1.5 rounded-full bg-emerald-500" />
              Live
            </Badge>
          )}
          {meeting.captureSource === "bot_sim" && meeting.botState !== "done" && (
            <Badge tone="amber">{BOT_STATE_LABEL[meeting.botState]}</Badge>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-[12px] text-ink-500">
          <SourceIcon className="size-3.5 text-ink-400" />
          <span>
            {new Date(meeting.date).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span className="text-ink-300">·</span>
          <span>{formatDuration(meeting.durationMs)}</span>
          <span className="text-ink-300">·</span>
          <button
            onClick={() => setInfoOpen(true)}
            className="flex items-center gap-1 hover:text-brand-600"
          >
            <Users className="size-3.5" />
            {meeting.participants.length}
          </button>
          {meeting.channels.map((c) => (
            <Badge key={c.id} tone="neutral">
              {c.isPrivate ? <Lock /> : <span className="text-ink-400">#</span>}
              {c.title}
            </Badge>
          ))}
          <Badge tone={meeting.privacy === "private" ? "neutral" : "outline"}>
            {meeting.privacy === "private" ? <Lock /> : <Globe />}
            {meeting.privacy}
          </Badge>
        </div>
      </div>

      <AvatarStack names={names} size={26} />

      <Tooltip content="Copy link">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check className="text-emerald-600" /> : <Link2 />}
        </Button>
      </Tooltip>

      <Button variant="secondary" size="md" onClick={() => setShareOpen(true)}>
        <Share2 />
        Share
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setInfoOpen(true)}>
            <Users />
            Meeting info
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/meetings/${meeting.id}/export?format=md`} download>
              <Download />
              Download notes (.md)
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/meetings/${meeting.id}/export?format=txt`} download>
              <Download />
              Download transcript (.txt)
            </a>
          </DropdownMenuItem>
          {meeting.audioUrl && (
            <DropdownMenuItem asChild>
              <a href={meeting.audioUrl} download target="_blank" rel="noreferrer">
                <Download />
                Download audio
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={remove}>
            <Trash2 />
            Delete meeting
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareDialog meetingId={meeting.id} open={shareOpen} onOpenChange={setShareOpen} />
      <MeetingInfoDialog meeting={meeting} open={infoOpen} onOpenChange={setInfoOpen} />
    </header>
  );
}
