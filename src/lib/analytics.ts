import type { AiFilters, SpeakerAnalytics, Word } from "@/db/schema";

const FILLERS = [
  "um", "uh", "erm", "ah", "hmm", "like", "actually", "basically",
  "literally", "honestly", "obviously", "right", "okay", "so", "well", "yeah",
];

const FILLER_PHRASES = ["you know", "i mean", "sort of", "kind of", "a bit"];

const MONOLOGUE_THRESHOLD_MS = 25_000;

export type AnalyticsInput = {
  index: number;
  speakerIndex: number;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
  words: Word[];
  aiFilters: AiFilters | null;
};

export function countFillers(text: string) {
  const lower = ` ${text.toLowerCase().replace(/[.,!?;:]/g, "")} `;
  let count = 0;
  for (const phrase of FILLER_PHRASES) {
    count += lower.split(` ${phrase} `).length - 1;
  }
  for (const filler of FILLERS) {
    count += lower.split(` ${filler} `).length - 1;
  }
  return count;
}

export function computeAnalytics(
  sentences: AnalyticsInput[],
  speakerNames: Map<number, string>,
  meetingDurationMs: number,
) {
  const bySpeaker = new Map<number, AnalyticsInput[]>();
  for (const s of sentences) {
    const list = bySpeaker.get(s.speakerIndex) ?? [];
    list.push(s);
    bySpeaker.set(s.speakerIndex, list);
  }

  const runs: { speakerIndex: number; startMs: number; endMs: number }[] = [];
  for (const s of sentences) {
    const last = runs[runs.length - 1];
    if (last && last.speakerIndex === s.speakerIndex && s.startMs - last.endMs < 2500) {
      last.endMs = s.endMs;
    } else {
      runs.push({ speakerIndex: s.speakerIndex, startMs: s.startMs, endMs: s.endMs });
    }
  }

  const totalTalkMs = sentences.reduce((acc, s) => acc + (s.endMs - s.startMs), 0);

  const speakers: SpeakerAnalytics[] = [];
  for (const [speakerIndex, items] of [...bySpeaker.entries()].sort((a, b) => a[0] - b[0])) {
    const durationMs = items.reduce((acc, s) => acc + (s.endMs - s.startMs), 0);
    const wordCount = items.reduce(
      (acc, s) => acc + (s.words.length || s.text.split(/\s+/).filter(Boolean).length),
      0,
    );
    const speakerRuns = runs.filter((r) => r.speakerIndex === speakerIndex);
    const longestMonologueMs = speakerRuns.reduce(
      (acc, r) => Math.max(acc, r.endMs - r.startMs),
      0,
    );
    const monologuesCount = speakerRuns.filter(
      (r) => r.endMs - r.startMs >= MONOLOGUE_THRESHOLD_MS,
    ).length;
    const fillerWords = items.reduce((acc, s) => acc + countFillers(s.text), 0);
    const questions = items.filter(
      (s) => s.aiFilters?.question ?? s.text.trim().endsWith("?"),
    ).length;

    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    for (const s of items) {
      const key = s.aiFilters?.sentiment ?? "neutral";
      sentiment[key] += 1;
    }

    speakers.push({
      speakerIndex,
      name: speakerNames.get(speakerIndex) ?? `Speaker ${speakerIndex + 1}`,
      durationMs,
      wordCount,
      longestMonologueMs,
      monologuesCount,
      fillerWords,
      questions,
      durationPct: totalTalkMs ? (durationMs / totalTalkMs) * 100 : 0,
      wordsPerMinute: durationMs ? Math.round(wordCount / (durationMs / 60000)) : 0,
      sentiment,
    });
  }

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  for (const s of sentences) {
    const key = s.aiFilters?.sentiment ?? "neutral";
    if (key === "positive") positive += 1;
    else if (key === "negative") negative += 1;
    else neutral += 1;
  }
  const total = Math.max(1, sentences.length);

  return {
    positivePct: (positive / total) * 100,
    neutralPct: (neutral / total) * 100,
    negativePct: (negative / total) * 100,
    talkTimeMs: totalTalkMs,
    silenceMs: Math.max(0, meetingDurationMs - totalTalkMs),
    questionCount: sentences.filter(
      (s) => s.aiFilters?.question ?? s.text.trim().endsWith("?"),
    ).length,
    taskCount: sentences.filter((s) => s.aiFilters?.task).length,
    speakers,
  };
}
