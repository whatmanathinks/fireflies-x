"use client";

import { useEffect, useState } from "react";

export type Capabilities = {
  liveTranscription: boolean;
  blobStorage: boolean;
  realNotetaker: boolean;
};

const FALLBACK: Capabilities = {
  liveTranscription: false,
  blobStorage: false,
  realNotetaker: false,
};

let cached: Capabilities | null = null;

export function useCapabilities() {
  const [caps, setCaps] = useState<Capabilities | null>(cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetch("/api/capabilities")
      .then((r) => (r.ok ? r.json() : FALLBACK))
      .then((d: Capabilities) => {
        cached = d;
        if (alive) setCaps(d);
      })
      .catch(() => alive && setCaps(FALLBACK));
    return () => {
      alive = false;
    };
  }, []);

  return caps;
}
