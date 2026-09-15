"use client";

import { AlertTriangle, Circle, Loader2, Mic, MonitorSpeaker, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/primitives";
import { startCapture, type CaptureMode, type RecorderHandles } from "@/lib/audio/recorder";
import { DeepgramLiveClient, type LiveSentence } from "@/lib/stt/live-client";
import { cn, formatTimecode } from "@/lib/utils";

type Phase = "setup" | "starting" | "recording" | "finishing";

const FLUSH_INTERVAL_MS = 3000;

export function RecordDialog({
  open,
  onOpenChange,
  onCreated,
  liveEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (meetingId: string) => void;
  liveEnabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<CaptureMode>("mic+tab");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lines, setLines] = useState<LiveSentence[]>([]);
  const [interim, setInterim] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [liveActive, setLiveActive] = useState(false);

  const handlesRef = useRef<RecorderHandles | null>(null);
  const clientRef = useRef<DeepgramLiveClient | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const queueRef = useRef<LiveSentence[]>([]);
  const startedAtRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setPhase("setup");
    setElapsedMs(0);
    setLines([]);
    setInterim("");
    setWarning(null);
    setLiveActive(false);
    handlesRef.current = null;
    clientRef.current = null;
    meetingIdRef.current = null;
    queueRef.current = [];
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(timer);
  }, [phase]);

  const flushQueue = useCallback(async () => {
    const meetingId = meetingIdRef.current;
    if (!meetingId || queueRef.current.length === 0) return;
    const batch = queueRef.current.splice(0, queueRef.current.length);
    try {
      await fetch(`/api/meetings/${meetingId}/sentences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentences: batch,
          durationMs: Date.now() - startedAtRef.current,
        }),
      });
    } catch {
      queueRef.current.unshift(...batch);
    }
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(flushQueue, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phase, flushQueue]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, interim]);

  async function begin() {
    setPhase("starting");
    setWarning(null);

    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || `Recording · ${new Date().toLocaleString()}`,
          source: "browser",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create meeting");
      const { id } = (await res.json()) as { id: string };
      meetingIdRef.current = id;

      let client: DeepgramLiveClient | null = null;
      if (liveEnabled) {
        client = new DeepgramLiveClient({
          sampleRate: 48000,
          onInterim: (text) => setInterim(text),
          onSentence: (sentence) => {
            setLines((prev) => [...prev, sentence]);
            queueRef.current.push(sentence);
          },
          onError: (message) => setWarning(message),
        });
      }

      const handles = await startCapture(mode, (chunk) => client?.send(chunk));
      handlesRef.current = handles;

      if (client) {
        try {
          (client as unknown as { options: { sampleRate: number } }).options.sampleRate =
            handles.sampleRate;
          await client.connect();
          clientRef.current = client;
          setLiveActive(true);
        } catch (error) {
          setWarning(
            error instanceof Error
              ? `${error.message}. Recording continues — the transcript will be produced after you stop.`
              : "Live transcription unavailable; recording continues.",
          );
        }
      }

      startedAtRef.current = Date.now();
      setPhase("recording");
    } catch (error) {
      reset();
      toast.error(error instanceof Error ? error.message : "Could not start recording");
    }
  }

  async function finish() {
    setPhase("finishing");
    const meetingId = meetingIdRef.current;
    const handles = handlesRef.current;
    if (!meetingId || !handles) return;

    try {
      await clientRef.current?.close();
      const blob = await handles.stop();
      const durationMs = Date.now() - startedAtRef.current;
      await flushQueue();

      let audioUrl: string | null = null;
      try {
        const form = new FormData();
        form.append("file", new File([blob], `recording-${meetingId}.webm`, { type: blob.type }));
        const uploaded = await fetch("/api/uploads/direct", { method: "POST", body: form });
        if (uploaded.ok) audioUrl = ((await uploaded.json()) as { url: string }).url;
      } catch {
        audioUrl = null;
      }

      await fetch(`/api/meetings/${meetingId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl, mimeType: blob.type, durationMs }),
      });

      toast.success("Recording saved — generating notes");
      onCreated(meetingId);
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save recording");
      setPhase("recording");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && (phase === "recording" || phase === "finishing")) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl" hideClose={phase === "recording"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === "recording" && (
              <Circle className="live-dot size-2.5 fill-red-500 text-red-500" />
            )}
            {phase === "recording" ? "Recording" : "Record a meeting"}
          </DialogTitle>
          <DialogDescription>
            {phase === "recording"
              ? liveActive
                ? "Live transcript streaming from Deepgram."
                : "Audio is being captured. The transcript is produced when you stop."
              : "Captures your microphone and, optionally, the audio of another browser tab."}
          </DialogDescription>
        </DialogHeader>

        {phase === "setup" || phase === "starting" ? (
          <div className="space-y-4 p-5">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
                Meeting title
              </label>
              <Input
                autoFocus
                value={title}
                placeholder="Weekly product sync"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && phase === "setup" && begin()}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
                What should be captured?
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <ModeCard
                  active={mode === "mic+tab"}
                  onClick={() => setMode("mic+tab")}
                  icon={MonitorSpeaker}
                  title="Tab audio + mic"
                  body="Pick the tab running your Google Meet or Zoom call. Captures everyone."
                />
                <ModeCard
                  active={mode === "mic"}
                  onClick={() => setMode("mic")}
                  icon={Mic}
                  title="Microphone only"
                  body="For in-person conversations or a voice memo."
                />
              </div>
            </div>

            {mode === "mic+tab" && (
              <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                <span>
                  In the share dialog choose the <b>tab</b> with your call and turn on{" "}
                  <b>Also share tab audio</b>. Without that toggle only your own voice is recorded.
                </span>
              </p>
            )}

            {!liveEnabled && (
              <p className="rounded-lg bg-ink-100 px-3 py-2 text-[12px] leading-relaxed text-ink-600">
                <b>Demo mode.</b> Audio is really recorded, but with no{" "}
                <code>DEEPGRAM_API_KEY</code> set the transcript is a scripted sample rather than
                your words.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={begin} disabled={phase === "starting"}>
                {phase === "starting" ? <Loader2 className="animate-spin" /> : <Circle className="fill-current" />}
                {phase === "starting" ? "Starting…" : "Start recording"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <span className="font-mono text-lg font-semibold tabular-nums text-ink-900">
                {formatTimecode(elapsedMs)}
              </span>
              {liveActive ? (
                <Badge tone="green">Live transcription on</Badge>
              ) : (
                <Badge tone="neutral">Recording audio</Badge>
              )}
              <span className="flex-1" />
              <span className="text-[12px] text-ink-400">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
            </div>

            {warning && (
              <p className="flex gap-2 border-b border-line bg-amber-50 px-5 py-2 text-[12px] text-amber-800">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                {warning}
              </p>
            )}

            <div
              ref={scrollRef}
              className="scrollbar-thin h-72 overflow-y-auto px-5 py-4"
            >
              {lines.length === 0 && !interim ? (
                <p className="py-10 text-center text-[13px] text-ink-400">
                  {liveActive ? "Listening…" : "Recording. Stop when you're done."}
                </p>
              ) : (
                <div className="space-y-3">
                  {lines.map((line, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span className="w-14 shrink-0 pt-px font-mono text-[11px] text-ink-400">
                        {formatTimecode(line.startMs)}
                      </span>
                      <div>
                        <span className="mr-1.5 text-[12.5px] font-semibold text-brand-700">
                          Speaker {line.speakerIndex + 1}
                        </span>
                        <span className="text-[13px] leading-relaxed text-ink-800">
                          {line.text}
                        </span>
                      </div>
                    </div>
                  ))}
                  {interim && (
                    <div className="flex gap-2.5 opacity-50">
                      <span className="w-14 shrink-0" />
                      <span className="text-[13px] leading-relaxed text-ink-600">{interim}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-line px-5 py-3">
              <Button
                variant="primary"
                size="lg"
                onClick={finish}
                disabled={phase === "finishing"}
                className="bg-red-600 hover:bg-red-700"
              >
                {phase === "finishing" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Square className="fill-current" />
                )}
                {phase === "finishing" ? "Saving…" : "Stop & save"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({
  active,
  onClick,
  icon: Icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition",
        active
          ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200"
          : "border-line hover:border-ink-300 hover:bg-ink-50",
      )}
    >
      <Icon className={cn("mb-1.5 size-4", active ? "text-brand-600" : "text-ink-400")} />
      <p className="text-[13px] font-semibold text-ink-900">{title}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{body}</p>
    </button>
  );
}
