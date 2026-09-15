"use client";

import { Avatar, Badge } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/primitives";
import { formatDuration, formatTimecode } from "@/lib/utils";
import type { MeetingHeaderData } from "./header";

export function MeetingInfoDialog({
  meeting,
  open,
  onOpenChange,
}: {
  meeting: MeetingHeaderData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const attendedNames = new Set(meeting.attendance.map((a) => a.name.toLowerCase()));
  const noShows = meeting.invited.filter(
    (email) => !attendedNames.has(email.split("@")[0].toLowerCase()) && !meeting.participants.includes(email),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meeting info</DialogTitle>
          <DialogDescription>{meeting.title}</DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin max-h-[26rem] space-y-5 overflow-y-auto p-5">
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-[12.5px]">
            <dt className="text-ink-400">Date</dt>
            <dd className="text-ink-800">
              {new Date(meeting.date).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </dd>
            <dt className="text-ink-400">Duration</dt>
            <dd className="text-ink-800">{formatDuration(meeting.durationMs)}</dd>
            <dt className="text-ink-400">Host</dt>
            <dd className="truncate text-ink-800">{meeting.hostEmail}</dd>
            <dt className="text-ink-400">Captured</dt>
            <dd className="text-ink-800">
              {meeting.captureSource === "browser"
                ? "Browser recording"
                : meeting.captureSource === "upload"
                  ? "Uploaded file"
                  : meeting.captureSource === "bot_sim"
                    ? "Notetaker bot (simulated)"
                    : "Seeded sample"}
            </dd>
            <dt className="text-ink-400">Privacy</dt>
            <dd className="text-ink-800">{meeting.privacy}</dd>
            {meeting.meetingLink && (
              <>
                <dt className="text-ink-400">Link</dt>
                <dd className="truncate">
                  <a
                    href={meeting.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    {meeting.meetingLink}
                  </a>
                </dd>
              </>
            )}
            {meeting.channels.length > 0 && (
              <>
                <dt className="text-ink-400">Channels</dt>
                <dd className="flex flex-wrap gap-1">
                  {meeting.channels.map((c) => (
                    <Badge key={c.id} tone="neutral">
                      {c.isPrivate ? "🔒" : "#"} {c.title}
                    </Badge>
                  ))}
                </dd>
              </>
            )}
          </dl>

          {meeting.attendance.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Attended · {meeting.attendance.length}
              </p>
              <div className="space-y-1.5">
                {meeting.attendance.map((a) => (
                  <div key={a.name} className="flex items-center gap-2">
                    <Avatar name={a.name} size={22} />
                    <span className="flex-1 truncate text-[12.5px] text-ink-800">{a.name}</span>
                    <span className="font-mono text-[11px] text-ink-400">
                      {formatTimecode(a.joinMs)} – {formatTimecode(a.leaveMs)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {noShows.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Invited, did not attend · {noShows.length}
              </p>
              <div className="space-y-1.5">
                {noShows.map((email) => (
                  <div key={email} className="flex items-center gap-2 opacity-60">
                    <Avatar name={email} size={22} />
                    <span className="truncate text-[12.5px] text-ink-700">{email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
