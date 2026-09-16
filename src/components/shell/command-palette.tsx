"use client";

import { Command } from "cmdk";
import { CalendarDays, Loader2, Quote, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/primitives";
import { formatTimecode } from "@/lib/utils";

type Result = {
  meetings: { id: string; title: string; date: string; durationMs: number }[];
  moments: {
    meetingId: string;
    meetingTitle: string;
    index: number;
    speakerName: string;
    text: string;
    startMs: number;
  }[];
};

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result>({ meetings: [], moments: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) setResults((await res.json()) as Result);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, query ? 180 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const setOpen = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose className="max-w-xl p-0 top-[22%] translate-y-0">
        <Command shouldFilter={false} loop>
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-ink-400" />
            ) : (
              <Search className="size-4 shrink-0 text-ink-400" />
            )}
            <Command.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Search meetings and moments…"
              className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-400"
            />
          </div>

          <Command.List className="scrollbar-thin max-h-[22rem] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-400">
              {query ? `Nothing matches "${query}"` : "Start typing to search"}
            </Command.Empty>

            {results.meetings.length > 0 && (
              <Command.Group
                heading="Meetings"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-400"
              >
                {results.meetings.map((m) => (
                  <Command.Item
                    key={m.id}
                    value={`meeting-${m.id}`}
                    onSelect={() => go(`/meetings/${m.id}`)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] data-[selected=true]:bg-ink-100"
                  >
                    <CalendarDays className="size-3.5 shrink-0 text-ink-400" />
                    <span className="flex-1 truncate text-ink-800">{m.title}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-400" suppressHydrationWarning>
                      {new Date(m.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {results.moments.length > 0 && (
              <Command.Group
                heading="Moments"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-400"
              >
                {results.moments.map((m) => (
                  <Command.Item
                    key={`${m.meetingId}-${m.index}`}
                    value={`moment-${m.meetingId}-${m.index}`}
                    onSelect={() => go(`/meetings/${m.meetingId}?t=${m.startMs}`)}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-[13px] data-[selected=true]:bg-ink-100"
                  >
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-ink-800">{m.text}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-ink-400">
                        {m.speakerName} · {m.meetingTitle} · {formatTimecode(m.startMs)}
                      </p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {query && (
              <Command.Item
                value="askfred"
                onSelect={() => go(`/askfred?q=${encodeURIComponent(query)}`)}
                className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg border-t border-line px-2 py-2.5 text-[13px] data-[selected=true]:bg-brand-50"
              >
                <Sparkles className="size-3.5 shrink-0 text-brand-600" />
                <span className="text-ink-800">
                  Ask Fred: <span className="font-medium">{query}</span>
                </span>
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
