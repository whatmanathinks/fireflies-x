"use client";

import { AlertTriangle, AudioLines, BarChart3, FileText, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import type { Chapter } from "@/db/schema";
import { cn } from "@/lib/utils";
import { BOT_STATE_LABEL } from "@/lib/labels";
import { AnalyticsTab, type AnalyticsData } from "./analytics-tab";
import { AskFredPanel } from "./askfred-panel";
import { NotepadHeader, type MeetingHeaderData } from "./header";
import { PlaybackProvider } from "./playback";
import { Player, type Marker } from "./player";
import {
  IconRail,
  SidePanel,
  type BiteRow,
  type BookmarkRow,
  type CommentRow,
  type RailKey,
} from "./side-panels";
import { SummaryPane, type SummaryData } from "./summary-pane";
import { TranscriptPane, type SpeakerRow, type TranscriptSentence } from "./transcript-pane";

const ACTIVE_STATUSES = new Set([
  "recording",
  "uploading",
  "transcribing",
  "summarizing",
  "scheduled",
]);

export function Notepad({
  meeting,
  sentences,
  speakers,
  summary,
  analytics,
  bites,
  comments,
  bookmarks,
  provider,
  progressNote,
  failureCode,
  failureReason,
}: {
  meeting: MeetingHeaderData;
  sentences: TranscriptSentence[];
  speakers: SpeakerRow[];
  summary: SummaryData | null;
  analytics: AnalyticsData | null;
  bites: BiteRow[];
  comments: CommentRow[];
  bookmarks: BookmarkRow[];
  provider: string;
  progressNote: string | null;
  failureCode: string | null;
  failureReason: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [rail, setRail] = useState<RailKey | null>(null);
  const [selection, setSelection] = useState<
    { startMs: number; endMs: number; text: string } | null
  >(null);
  const [jumpTo, setJumpTo] = useState<number | null>(null);

  const initialSeek = params.get("t") ? Number(params.get("t")) : null;

  useEffect(() => {
    if (!ACTIVE_STATUSES.has(meeting.status)) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [meeting.status, router]);

  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = [];
    for (const chapter of summary?.outline ?? []) {
      out.push({ timeMs: chapter.startMs, kind: "chapter", label: chapter.title });
    }
    for (const bite of bites) {
      out.push({ timeMs: bite.startMs, kind: "bite", label: bite.name });
    }
    for (const comment of comments) {
      if (comment.timeMs !== null) {
        out.push({ timeMs: comment.timeMs, kind: "comment", label: comment.body.slice(0, 60) });
      }
    }
    for (const bookmark of bookmarks) {
      out.push({ timeMs: bookmark.timeMs, kind: "bookmark", label: bookmark.label });
    }
    return out;
  }, [summary, bites, comments, bookmarks]);

  const railCounts = {
    bites: bites.length,
    comments: comments.filter((c) => !c.parentId).length,
    bookmarks: bookmarks.length,
  };

  const indexToMs = useMemo(
    () => new Map(sentences.map((s) => [s.index, s.startMs])),
    [sentences],
  );

  return (
    <PlaybackProvider
      fallbackDurationMs={meeting.durationMs || 1}
      hasMedia={!!meeting.audioUrl}
    >
      <div className="flex h-full flex-col">
        <NotepadHeader meeting={meeting} />

        <div className="flex min-h-0 flex-1">
          <IconRail active={rail} counts={railCounts} onSelect={setRail} />

          {rail && (
            <SidePanel
              panel={rail}
              meetingId={meeting.id}
              sentences={sentences}
              outline={(summary?.outline ?? []) as Chapter[]}
              bites={bites}
              comments={comments}
              bookmarks={bookmarks}
              selection={selection}
              onClose={() => setRail(null)}
              onRefresh={() => router.refresh()}
            />
          )}

          <div className="flex min-w-0 flex-1 flex-col border-r border-line bg-white">
            <Tabs defaultValue="notes" className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
                <TabsList>
                  <TabsTrigger value="notes">
                    <FileText className="size-3.5" />
                    Notes
                  </TabsTrigger>
                  <TabsTrigger value="analytics">
                    <BarChart3 className="size-3.5" />
                    Analytics
                  </TabsTrigger>
                  <TabsTrigger value="askfred">
                    <Sparkles className="size-3.5" />
                    AskFred
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="notes" className="min-h-0 flex-1 data-[state=inactive]:hidden">
                <SummaryPane
                  meetingId={meeting.id}
                  summary={summary}
                  status={meeting.status}
                  provider={provider}
                  progressNote={progressNote}
                  failureCode={failureCode}
                  failureReason={failureReason}
                  onSeekSentence={(index) => {
                    if (index === null) return;
                    const ms = indexToMs.get(index);
                    if (ms !== undefined) setJumpTo(ms);
                  }}
                />
              </TabsContent>

              <TabsContent
                value="analytics"
                className="min-h-0 flex-1 data-[state=inactive]:hidden"
              >
                <AnalyticsTab analytics={analytics} durationMs={meeting.durationMs} />
              </TabsContent>

              <TabsContent
                value="askfred"
                className="min-h-0 flex-1 data-[state=inactive]:hidden"
              >
                <AskFredPanel meetingId={meeting.id} hasTranscript={sentences.length > 0} />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex w-[46%] min-w-0 shrink-0 flex-col bg-white">
            {sentences.length > 0 ? (
              <TranscriptPane
                meetingId={meeting.id}
                sentences={sentences}
                speakers={speakers}
                onSelectionChange={setSelection}
                jumpTo={jumpTo ?? initialSeek}
              />
            ) : (
              <TranscriptPending
                status={meeting.status}
                botState={meeting.botState}
                failureCode={failureCode}
                failureReason={failureReason}
              />
            )}
          </div>
        </div>

        <Player
          audioUrl={meeting.audioUrl}
          markers={markers}
          selectionRange={selection}
          onCreateBite={() => setRail("bites")}
        />
      </div>
    </PlaybackProvider>
  );
}

function TranscriptPending({
  status,
  botState,
  failureCode,
  failureReason,
}: {
  status: string;
  botState: string;
  failureCode: string | null;
  failureReason: string | null;
}) {
  const failed = status === "failed";
  const noSpeech = failureCode === "no_speech";

  const label = failed
    ? noSpeech
      ? "No speech in this audio"
      : failureCode === "not_admitted"
        ? "The notetaker wasn't let in"
        : "Transcription didn't finish"
    : botState !== "idle" && botState !== "done"
      ? BOT_STATE_LABEL[botState] ?? "Notetaker running…"
      : status === "transcribing"
        ? "Transcribing audio…"
        : status === "recording"
          ? "Recording in progress…"
          : "Waiting for audio…";

  const detail = failed
    ? noSpeech
      ? "The file played fine, but there were no spoken words to transcribe — music, silence and ambient audio have nothing to work from. Upload a recording of people talking."
      : (failureReason ??
        "Something went wrong on the way to a transcript. Re-uploading the audio usually clears it.")
    : "This page updates on its own as the transcript comes in.";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      {!failed && (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-brand-400"
              style={{ animation: `ff-pulse-dot 1.2s ${i * 0.18}s ease-in-out infinite` }}
            />
          ))}
        </div>
      )}
      {failed && (
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full",
            noSpeech ? "bg-ink-100 text-ink-400" : "bg-amber-50 text-amber-600",
          )}
        >
          {noSpeech ? <AudioLines className="size-4" /> : <AlertTriangle className="size-4" />}
        </span>
      )}
      <p className="text-[14px] font-semibold text-ink-800">{label}</p>
      <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-500">{detail}</p>
    </div>
  );
}
