import type { TranscriptLine } from "./client";
import { env } from "@/lib/env";
import { activeProvider } from "./provider";

const CHARS_PER_TOKEN = 3.6;
const SAFETY_TOKENS = 600;

export function estimateTokens(text: string) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function timecode(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export type Turn = {
  speakerName: string;
  startMs: number;
  startIndex: number;
  endIndex: number;
  text: string;
};

export function groupIntoTurns(lines: TranscriptLine[]): Turn[] {
  const turns: Turn[] = [];
  for (const line of lines) {
    const last = turns[turns.length - 1];
    if (last && last.speakerName === line.speakerName) {
      last.text += ` ${line.text}`;
      last.endIndex = line.index;
    } else {
      turns.push({
        speakerName: line.speakerName,
        startMs: line.startMs,
        startIndex: line.index,
        endIndex: line.index,
        text: line.text,
      });
    }
  }
  return turns;
}

export function renderTurns(turns: Turn[]) {
  return turns
    .map((t) => `#${t.startIndex} ${timecode(t.startMs)} ${t.speakerName}: ${t.text}`)
    .join("\n");
}

export function renderIndexed(lines: TranscriptLine[]) {
  const out: string[] = [];
  let lastSpeaker = "";
  for (const line of lines) {
    if (line.speakerName !== lastSpeaker) {
      out.push(`-- ${line.speakerName} @ ${timecode(line.startMs)}`);
      lastSpeaker = line.speakerName;
    }
    out.push(`${line.index} ${line.text}`);
  }
  return out.join("\n");
}

export function inputBudget(reservedOutputTokens: number) {
  if (activeProvider() === "anthropic") return 400_000;
  const tpm = env.llmTpmBudget;
  if (!tpm || tpm <= 0) return 100_000;
  return Math.max(1200, tpm - reservedOutputTokens - SAFETY_TOKENS);
}

export function chunkTurns(turns: Turn[], budgetTokens: number): Turn[][] {
  const chunks: Turn[][] = [];
  let current: Turn[] = [];
  let used = 0;

  for (const turn of turns) {
    const cost = estimateTokens(turn.text) + 14;
    if (current.length && used + cost > budgetTokens) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(turn);
    used += cost;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function chunkLines(lines: TranscriptLine[], budgetTokens: number): TranscriptLine[][] {
  const chunks: TranscriptLine[][] = [];
  let current: TranscriptLine[] = [];
  let used = 0;

  for (const line of lines) {
    const cost = estimateTokens(line.text) + 6;
    if (current.length && used + cost > budgetTokens) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(line);
    used += cost;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
