"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PlaybackValue = {
  currentMs: number;
  durationMs: number;
  playing: boolean;
  rate: number;
  hasMedia: boolean;
  ready: boolean;
  seek: (ms: number) => void;
  toggle: () => void;
  skip: (deltaMs: number) => void;
  setRate: (rate: number) => void;
  registerMedia: (controls: MediaControls | null) => void;
  reportTime: (ms: number) => void;
  reportPlaying: (playing: boolean) => void;
  reportReady: (durationMs: number) => void;
};

export type MediaControls = {
  play: () => void;
  pause: () => void;
  seekTo: (ms: number) => void;
  setRate: (rate: number) => void;
};

const PlaybackContext = createContext<PlaybackValue | null>(null);

export function PlaybackProvider({
  fallbackDurationMs,
  hasMedia,
  children,
}: {
  fallbackDurationMs: number;
  hasMedia: boolean;
  children: React.ReactNode;
}) {
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(fallbackDurationMs);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [ready, setReady] = useState(!hasMedia);
  const mediaRef = useRef<MediaControls | null>(null);
  const virtualRef = useRef<{ startedAt: number; from: number } | null>(null);

  useEffect(() => {
    if (hasMedia || !playing) return;
    virtualRef.current = { startedAt: performance.now(), from: currentMs };
    let raf = 0;
    const tick = () => {
      const state = virtualRef.current;
      if (!state) return;
      const next = state.from + (performance.now() - state.startedAt) * rate;
      if (next >= durationMs) {
        setCurrentMs(durationMs);
        setPlaying(false);
        return;
      }
      setCurrentMs(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, hasMedia, rate, durationMs]);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, durationMs));
      setCurrentMs(clamped);
      virtualRef.current = { startedAt: performance.now(), from: clamped };
      mediaRef.current?.seekTo(clamped);
    },
    [durationMs],
  );

  const toggle = useCallback(() => {
    setPlaying((prev) => {
      const next = !prev;
      if (mediaRef.current) next ? mediaRef.current.play() : mediaRef.current.pause();
      return next;
    });
  }, []);

  const skip = useCallback(
    (deltaMs: number) => seek(currentMs + deltaMs),
    [currentMs, seek],
  );

  const setRate = useCallback((next: number) => {
    setRateState(next);
    mediaRef.current?.setRate(next);
  }, []);

  const value = useMemo<PlaybackValue>(
    () => ({
      currentMs,
      durationMs,
      playing,
      rate,
      hasMedia,
      ready,
      seek,
      toggle,
      skip,
      setRate,
      registerMedia: (controls) => {
        mediaRef.current = controls;
      },
      reportTime: setCurrentMs,
      reportPlaying: setPlaying,
      reportReady: (ms) => {
        if (ms > 0) setDurationMs(ms);
        setReady(true);
      },
    }),
    [currentMs, durationMs, playing, rate, hasMedia, ready, seek, toggle, skip, setRate],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used inside PlaybackProvider");
  return ctx;
}

export function useActiveIndex(sentences: { index: number; startMs: number; endMs: number }[]) {
  const { currentMs } = usePlayback();
  return useMemo(() => {
    if (!sentences.length) return -1;
    let lo = 0;
    let hi = sentences.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sentences[mid].startMs <= currentMs) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }, [currentMs, sentences]);
}
