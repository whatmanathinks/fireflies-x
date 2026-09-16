import { env } from "@/lib/env";

const DG = "https://api.deepgram.com";

export type DeepgramWord = {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
};

export type DeepgramResponse = {
  metadata?: { duration?: number; request_id?: string };
  results?: {
    channels?: {
      alternatives?: { transcript?: string; words?: DeepgramWord[] }[];
    }[];
    utterances?: {
      start: number;
      end: number;
      transcript: string;
      speaker?: number;
      words?: DeepgramWord[];
    }[];
  };
};

function listenParams(keyterms: string[]) {
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
    paragraphs: "true",
    filler_words: "true",
    language: "en",
  });
  for (const term of keyterms.slice(0, 50)) params.append("keyterm", term);
  return params;
}

let liveProbe: { ok: boolean; reason: string | null; at: number } | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000;

export async function canStreamLive(): Promise<{ ok: boolean; reason: string | null }> {
  if (!env.deepgramApiKey) return { ok: false, reason: "DEEPGRAM_API_KEY is not set" };
  if (liveProbe && Date.now() - liveProbe.at < PROBE_TTL_MS) {
    return { ok: liveProbe.ok, reason: liveProbe.reason };
  }

  try {
    await grantLiveToken(10);
    liveProbe = { ok: true, reason: null, at: Date.now() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = /FORBIDDEN|Insufficient permissions|403/i.test(message)
      ? "This Deepgram key cannot mint streaming tokens. Create a key with the Member role (or higher) to enable live transcription."
      : "Deepgram streaming is unavailable right now.";
    liveProbe = { ok: false, reason, at: Date.now() };
  }

  return { ok: liveProbe.ok, reason: liveProbe.reason };
}

export async function grantLiveToken(ttlSeconds = 60) {
  const res = await fetch(`${DG}/v1/auth/grant`, {
    method: "POST",
    headers: {
      Authorization: `Token ${env.deepgramApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
  });
  if (!res.ok) {
    throw new Error(`Deepgram token grant failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function transcribeUrlSync(url: string, keyterms: string[] = []) {
  const params = listenParams(keyterms);
  const res = await fetch(`${DG}/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${env.deepgramApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`Deepgram transcription failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as DeepgramResponse;
}

export async function transcribeBufferSync(
  body: Buffer,
  contentType: string,
  keyterms: string[] = [],
) {
  const params = listenParams(keyterms);
  const res = await fetch(`${DG}/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${env.deepgramApiKey}`,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    throw new Error(`Deepgram transcription failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as DeepgramResponse;
}

export async function transcribeUrlAsync(
  url: string,
  callbackUrl: string,
  keyterms: string[] = [],
) {
  const params = listenParams(keyterms);
  params.set("callback", callbackUrl);
  params.set("callback_method", "post");

  const res = await fetch(`${DG}/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${env.deepgramApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`Deepgram async submit failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { request_id: string };
}

type ParsedSentence = {
  speakerIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  words: { w: string; s: number; e: number }[];
};

function splitIntoSentences(
  speakerIndex: number,
  words: DeepgramWord[],
  fallbackText: string,
  fallbackStartMs: number,
  fallbackEndMs: number,
): ParsedSentence[] {
  if (!words.length) {
    const text = fallbackText.trim();
    return text
      ? [{ speakerIndex, text, startMs: fallbackStartMs, endMs: fallbackEndMs, words: [] }]
      : [];
  }

  const out: ParsedSentence[] = [];
  let run: DeepgramWord[] = [];

  const flush = () => {
    if (!run.length) return;
    const text = run.map((w) => w.punctuated_word ?? w.word).join(" ").trim();
    if (text) {
      out.push({
        speakerIndex,
        text,
        startMs: Math.round(run[0].start * 1000),
        endMs: Math.round(run[run.length - 1].end * 1000),
        words: run.map((w) => ({
          w: w.punctuated_word ?? w.word,
          s: Math.round(w.start * 1000),
          e: Math.round(w.end * 1000),
        })),
      });
    }
    run = [];
  };

  for (const word of words) {
    run.push(word);
    const token = word.punctuated_word ?? word.word;
    if (/[.!?]["')\]]?$/.test(token) && run.length >= 3) flush();
  }
  flush();

  return out;
}

export function utterancesToSentences(payload: DeepgramResponse) {
  const utterances = payload.results?.utterances ?? [];
  const out: ParsedSentence[] = [];

  for (const u of utterances) {
    out.push(
      ...splitIntoSentences(
        u.speaker ?? 0,
        u.words ?? [],
        u.transcript ?? "",
        Math.round(u.start * 1000),
        Math.round(u.end * 1000),
      ),
    );
  }

  if (out.length === 0) {
    const alt = payload.results?.channels?.[0]?.alternatives?.[0];
    const words = alt?.words ?? [];
    out.push(
      ...splitIntoSentences(
        0,
        words,
        alt?.transcript ?? "",
        words.length ? Math.round(words[0].start * 1000) : 0,
        words.length ? Math.round(words[words.length - 1].end * 1000) : 0,
      ),
    );
  }

  return out;
}
