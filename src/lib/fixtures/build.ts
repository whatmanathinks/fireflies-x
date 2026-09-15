import type { Fixture } from "./transcripts";

const WORDS_PER_SEC = 2.65;
const TURN_GAP_MS = 420;
const SENTENCE_GAP_MS = 140;

export type BuiltSentence = {
  index: number;
  speakerIndex: number;
  speakerName: string;
  text: string;
  rawText: string;
  startMs: number;
  endMs: number;
  words: { w: string; s: number; e: number }[];
};

function splitSentences(text: string) {
  const parts = text.match(/[^.!?]+[.!?]*/g);
  if (!parts) return [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function buildSentences(fixture: Fixture): BuiltSentence[] {
  const out: BuiltSentence[] = [];
  let cursor = 1200;
  let index = 0;
  let prevSpeaker = -1;

  for (const [speakerIndex, turnText] of fixture.turns) {
    if (prevSpeaker !== -1) cursor += speakerIndex === prevSpeaker ? SENTENCE_GAP_MS : TURN_GAP_MS;
    prevSpeaker = speakerIndex;

    for (const sentence of splitSentences(turnText)) {
      const tokens = sentence.split(/\s+/).filter(Boolean);
      const durationMs = Math.max(700, Math.round((tokens.length / WORDS_PER_SEC) * 1000));
      const startMs = cursor;
      const per = durationMs / Math.max(1, tokens.length);
      const words = tokens.map((w, i) => ({
        w,
        s: Math.round(startMs + i * per),
        e: Math.round(startMs + (i + 1) * per),
      }));
      const endMs = startMs + durationMs;

      out.push({
        index: index++,
        speakerIndex,
        speakerName: fixture.speakers[speakerIndex],
        text: sentence,
        rawText: sentence.toLowerCase().replace(/[.,!?]/g, ""),
        startMs,
        endMs,
        words,
      });

      cursor = endMs + SENTENCE_GAP_MS;
    }
  }
  return out;
}

export function fixtureDuration(sentences: BuiltSentence[]) {
  return sentences.length ? sentences[sentences.length - 1].endMs + 1500 : 0;
}
