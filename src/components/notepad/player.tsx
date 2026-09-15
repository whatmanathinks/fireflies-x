"use client";

import {
  Bookmark,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Scissors,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { cn, formatTimecode } from "@/lib/utils";
import { usePlayback } from "./playback";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

export type Marker = {
  timeMs: number;
  kind: "chapter" | "comment" | "bookmark" | "bite";
  label: string;
};

export function Player({
  audioUrl,
  markers,
  onCreateBite,
  selectionRange,
}: {
  audioUrl: string | null;
  markers: Marker[];
  onCreateBite?: () => void;
  selectionRange: { startMs: number; endMs: number } | null;
}) {
  const {
    currentMs,
    durationMs,
    playing,
    rate,
    hasMedia,
    seek,
    toggle,
    skip,
    setRate,
    registerMedia,
    reportTime,
    reportPlaying,
    reportReady,
  } = usePlayback();

  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;
    let disposed = false;
    let instance: import("wavesurfer.js").default | null = null;

    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (disposed || !containerRef.current) return;

      instance = WaveSurfer.create({
        container: containerRef.current,
        height: 34,
        waveColor: "#cbd0da",
        progressColor: "#5b5bd6",
        cursorColor: "#4f46e5",
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1.5,
        barRadius: 2,
        normalize: true,
        url: audioUrl,
      });

      instance.on("ready", () => reportReady(instance!.getDuration() * 1000));
      instance.on("timeupdate", (t) => reportTime(t * 1000));
      instance.on("play", () => reportPlaying(true));
      instance.on("pause", () => reportPlaying(false));
      instance.on("error", () => setLoadFailed(true));

      registerMedia({
        play: () => void instance?.play(),
        pause: () => instance?.pause(),
        seekTo: (ms) => {
          const total = instance?.getDuration() ?? 0;
          if (total > 0) instance?.seekTo(Math.min(1, ms / 1000 / total));
        },
        setRate: (r) => instance?.setPlaybackRate(r),
      });
    })();

    return () => {
      disposed = true;
      registerMedia(null);
      instance?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  const progress = durationMs > 0 ? (currentMs / durationMs) * 100 : 0;
  const showWave = !!audioUrl && !loadFailed;

  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-t border-line bg-white px-4">
      <div className="flex items-center gap-0.5">
        <Tooltip content="Back 15s">
          <Button variant="ghost" size="icon" onClick={() => skip(-15000)}>
            <RotateCcw />
          </Button>
        </Tooltip>
        <Button
          variant="primary"
          size="icon"
          className="mx-0.5 size-9 rounded-full"
          onClick={toggle}
        >
          {playing ? <Pause className="fill-current" /> : <Play className="fill-current translate-x-px" />}
        </Button>
        <Tooltip content="Forward 15s">
          <Button variant="ghost" size="icon" onClick={() => skip(15000)}>
            <RotateCw />
          </Button>
        </Tooltip>
      </div>

      <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-500">
        {formatTimecode(currentMs)}
      </span>

      <div className="relative min-w-0 flex-1">
        <div ref={containerRef} className={cn("w-full", !showWave && "hidden")} />

        {!showWave && (
          <button
            className="group relative flex h-8 w-full items-center"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - rect.left) / rect.width) * durationMs);
            }}
          >
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600 shadow"
              style={{ left: `${progress}%` }}
            />
          </button>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
          {markers.map((marker, i) => {
            const left = durationMs > 0 ? (marker.timeMs / durationMs) * 100 : 0;
            const tone =
              marker.kind === "chapter"
                ? "bg-ink-400"
                : marker.kind === "comment"
                  ? "bg-amber-500"
                  : marker.kind === "bite"
                    ? "bg-emerald-500"
                    : "bg-brand-400";
            return (
              <Tooltip key={`${marker.kind}-${i}`} content={marker.label} side="top">
                <button
                  className={cn(
                    "pointer-events-auto absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full",
                    tone,
                  )}
                  style={{ left: `${left}%` }}
                  onClick={() => seek(marker.timeMs)}
                />
              </Tooltip>
            );
          })}

          {selectionRange && durationMs > 0 && (
            <div
              className="absolute inset-y-0 rounded bg-brand-500/15 ring-1 ring-brand-400/40"
              style={{
                left: `${(selectionRange.startMs / durationMs) * 100}%`,
                width: `${Math.max(0.6, ((selectionRange.endMs - selectionRange.startMs) / durationMs) * 100)}%`,
              }}
            />
          )}
        </div>
      </div>

      <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-400">
        {formatTimecode(durationMs)}
      </span>

      {selectionRange && onCreateBite && (
        <Button variant="secondary" size="sm" onClick={onCreateBite}>
          <Scissors />
          Soundbite
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-11 font-mono tabular-nums">
            {rate}×
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[5rem]">
          {RATES.map((r) => (
            <DropdownMenuItem key={r} onSelect={() => setRate(r)}>
              <span className={cn("font-mono", r === rate && "font-bold text-brand-700")}>
                {r}×
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasMedia && (
        <Button variant="ghost" size="icon" onClick={() => setMuted((m) => !m)}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      )}

      {!hasMedia && (
        <Tooltip content="This meeting has a transcript but no stored audio. The timeline is simulated so transcript sync still works.">
          <span className="shrink-0 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
            No audio
          </span>
        </Tooltip>
      )}
    </div>
  );
}

export function markerIcon(kind: Marker["kind"]) {
  if (kind === "comment") return MessageSquare;
  if (kind === "bookmark") return Bookmark;
  return Scissors;
}
