import { env } from "@/lib/env";
import { QuotaExhaustedError } from "@/lib/errors";
import { candidates, type Candidate } from "../pool";
import type { ChatMessage, ContentPart, NoticeFn } from "../provider";

type ChatCompletionChoice = { message?: { content?: string }; delta?: { content?: string } };
type ChatCompletion = { choices?: ChatCompletionChoice[]; error?: { message?: string } };

const MAX_SWEEPS = 2;
const MAX_WAIT_MS = 30_000;

/** Output ceilings (Groq's OTPM) only surface in errors, so learn them once. */
const outputCaps = new Map<string, number>();
/** Endpoints that reject reasoning_effort, so we stop sending it. */
const noReasoning = new Set<string>();
/** Per-model daily quota exhaustion, so we skip rather than re-discover. */
const exhausted = new Set<string>();

let rotation = 0;

function key(c: Candidate) {
  return `${c.endpoint.name}:${c.model}`;
}

function learnOutputCap(id: string, detail: string) {
  const match = detail.match(/output tokens per minute \(OTPM\):\s*Limit\s*(\d+)/i);
  if (!match) return null;
  const cap = Math.max(256, Number(match[1]) - 64);
  outputCaps.set(id, cap);
  return cap;
}

function retryDelayMs(res: Response, detail: string, attempt: number) {
  const header = res.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.min(MAX_WAIT_MS, seconds * 1000 + 500);
  }
  const hinted = detail.match(/try again in ([\d.]+)s/i);
  if (hinted) return Math.min(MAX_WAIT_MS, Number(hinted[1]) * 1000 + 500);
  return Math.min(MAX_WAIT_MS, 2 ** attempt * 1000);
}

function joinParts(parts: ContentPart[]) {
  return parts.map((p) => p.text).join("\n\n");
}

type SendOptions = {
  body: Record<string, unknown>;
  stream?: boolean;
  onNotice?: NoticeFn;
};

async function send({ body, onNotice }: SendOptions) {
  const list = candidates(rotation++);
  if (!list.length) throw new Error("No LLM endpoint configured");

  const wanted = Number(body.max_tokens ?? 0);
  let index = 0;
  let sweep = 0;
  let lastDetail = "";
  const quotaMessages: string[] = [];

  for (;;) {
    if (index >= list.length) {
      if (sweep < MAX_SWEEPS) {
        const wait = retryDelayMs(new Response(), lastDetail, sweep);
        sweep += 1;
        index = 0;
        onNotice?.({
          message: `All ${list.length} model/key combinations are rate limited`,
          retryInMs: wait,
        });
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (quotaMessages.length) throw new QuotaExhaustedError(quotaMessages[0]);
      throw new Error(`Every configured model failed. Last response: ${lastDetail.slice(0, 250)}`);
    }

    const candidate = list[index];
    const id = key(candidate);

    if (exhausted.has(id)) {
      index += 1;
      continue;
    }

    const cap = outputCaps.get(id);
    if (cap && wanted && cap < wanted * 0.6) {
      index += 1;
      continue;
    }

    const payload: Record<string, unknown> = {
      ...body,
      model: candidate.model,
      ...(cap && wanted ? { max_tokens: Math.min(wanted, cap) } : {}),
    };
    if (!noReasoning.has(candidate.endpoint.baseUrl) && env.llmReasoningEffort !== "off") {
      payload.reasoning_effort = env.llmReasoningEffort;
    }

    let res: Response;
    try {
      res = await fetch(`${candidate.endpoint.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidate.endpoint.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
      index += 1;
      continue;
    }

    if (res.ok) return { res, candidate };

    const detail = await res.text();
    lastDetail = detail;

    if (
      res.status === 400 &&
      "reasoning_effort" in payload &&
      /reasoning_effort|unknown|unrecognized|not supported|invalid/i.test(detail)
    ) {
      noReasoning.add(candidate.endpoint.baseUrl);
      continue;
    }

    if (/tokens per day \(TPD\)/i.test(detail) || /quota|resource_exhausted/i.test(detail)) {
      exhausted.add(id);
      const used = detail.match(/Limit\s*(\d+),\s*Used\s*(\d+)/i);
      quotaMessages.push(
        `Daily quota exhausted for ${candidate.model} on ${candidate.endpoint.name}` +
          (used ? ` (${used[2]} of ${used[1]} used)` : "") +
          ". It resets at 00:00 UTC.",
      );
      onNotice?.({ message: `${candidate.endpoint.name} is out of daily quota — switching` });
      index += 1;
      continue;
    }

    const learned = learnOutputCap(id, detail);
    if (learned !== null) {
      onNotice?.({ message: `Adjusting output size for ${candidate.model}` });
      continue;
    }

    if (/json_validate_failed|failed to validate json|failed to generate json/i.test(detail)) {
      onNotice?.({ message: `${candidate.model} struggled with the format — switching` });
      index += 1;
      continue;
    }

    if (res.status === 413 || /reduce your message size/i.test(detail)) {
      throw new Error(
        `This transcript is too large for ${candidate.model}. Lower LLM_MAX_TOKENS ` +
          `(currently ${env.llmMaxTokens}) or use a model with a higher per-request limit.`,
      );
    }

    if (res.status === 429 || res.status >= 500) {
      onNotice?.({ message: `${candidate.endpoint.name} rate limited — switching` });
      index += 1;
      continue;
    }

    throw new Error(`${candidate.model} request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}

function stripFence(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : content).trim();
}

export async function openAiJson(
  jsonSchema: { name: string; schema: Record<string, unknown> },
  system: string,
  parts: ContentPart[],
  maxTokens?: number,
  onNotice?: NoticeFn,
): Promise<unknown> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: joinParts(parts) },
  ];

  const { res } = await send({
    body: {
      messages,
      max_tokens: maxTokens ?? env.llmMaxTokens,
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: { name: jsonSchema.name, schema: jsonSchema.schema, strict: true },
      },
    },
    onNotice,
  });

  const data = (await res.json()) as ChatCompletion;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned an empty response");
  return JSON.parse(stripFence(content));
}

export async function* openAiStream(
  system: string,
  contextParts: ContentPart[],
  history: ChatMessage[],
  question: string,
): AsyncGenerator<string> {
  const { res } = await send({
    body: {
      stream: true,
      max_tokens: Math.min(env.llmMaxTokens, 2000),
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: joinParts(contextParts) },
        { role: "assistant", content: "Ready." },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: question },
      ],
    },
  });

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload) as ChatCompletion;
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        /* partial frame */
      }
    }
  }
}
