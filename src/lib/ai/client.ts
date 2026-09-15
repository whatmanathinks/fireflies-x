export type TranscriptLine = {
  index: number;
  speakerName: string;
  startMs: number;
  text: string;
};

export function renderTranscript(lines: TranscriptLine[]) {
  return lines
    .map((l) => {
      const total = Math.floor(l.startMs / 1000);
      const m = String(Math.floor(total / 60)).padStart(2, "0");
      const s = String(total % 60).padStart(2, "0");
      return `[${l.index}] (${m}:${s}) ${l.speakerName}: ${l.text}`;
    })
    .join("\n");
}
