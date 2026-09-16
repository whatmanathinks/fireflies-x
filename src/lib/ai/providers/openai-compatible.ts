import { env } from "@/lib/env";
import { modelCandidates, type ChatMessage, type ContentPart, type NoticeFn } from "../provider";

type ChatCompletionChoice = { message?: { content?: string }; delta?: { content?: string } };
type ChatCompletion = { choices?: ChatCompletionChoice[]; error?: { message?: string } };

function endpoint() {
  return `${env.llmBaseUrl.replace(/\/$/, "")}/chat/completions`;
}

function headers() {
  return {
    Authorization: `Bearer ${env.llmApiKey}`,
    "Content-Type": "application/json",
  };
}

function joinParts(parts: ContentPart[]) {
  return parts.map((p) => p.text).join("\n\n");
}

const MAX_RETRIES = 3;
const MAX_WAIT_MS = 35_000;

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

function withReasoning(body: Record<string, unknown>) {
  const effort = env.llmReasoningEffort;
  if (!effort || effort === "off") return body;
  return { ...body, reasoning_effort: effort };
}

/**
 * Rate limits on Groq are per-model, so an exhausted model is worked around by
 * switching rather than waiting. Only when every candidate is limited do we back off.
 */
async function post(
  body: Record<string, unknown>,
  allowReasoning = true,
  onNotice?: NoticeFn,
) {
  const models = modelCandidates();
  let payload = allowReasoning ? withReasoning(body) : body;
  let modelIndex = 0;
  let sweep = 0;

  for (let attempt = 0; ; attempt++) {
    payload = { ...payload, model: models[modelIndex] };
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });

    if (res.ok) return res;

    const detail = await res.text();

    if (
      res.status === 400 &&
      "reasoning_effort" in payload &&
      /reasoning_effort|unknown|unrecognized|not supported/i.test(detail)
    ) {
      payload = body;
      continue;
    }
    if (res.status === 413 || /reduce your message size/i.test(detail)) {
      throw new Error(
        `This transcript is too large for ${env.llmModel} on your current tier. ` +
          `Lower LLM_MAX_TOKENS (currently ${env.llmMaxTokens}), pick a model with a higher ` +
          `tokens-per-minute limit, or use a shorter meeting.`,
      );
    }

    const retryable = res.status === 429 || res.status >= 500;

    if (retryable) {
      const current = models[modelIndex];

      if (modelIndex < models.length - 1) {
        modelIndex += 1;
        console.warn(`[llm] ${current} ${res.status}; switching to ${models[modelIndex]}`);
        onNotice?.({ message: `Switching to ${models[modelIndex]}` });
        continue;
      }

      if (sweep < MAX_RETRIES) {
        const wait = retryDelayMs(res, detail, sweep);
        sweep += 1;
        modelIndex = 0;
        console.warn(
          `[llm] all ${models.length} model(s) limited; waiting ${Math.round(wait / 1000)}s (sweep ${sweep}/${MAX_RETRIES})`,
        );
        onNotice?.({
          message:
            models.length > 1
              ? `All ${models.length} models are rate limited`
              : "Rate limited by the model provider",
          retryInMs: wait,
        });
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
    }

    throw new Error(`${models[modelIndex]} request failed (${res.status}): ${detail.slice(0, 400)}`);
  }
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

  const attempt = async (responseFormat: Record<string, unknown>) => {
    const res = await post(
      {
        model: env.llmModel,
        messages,
        max_tokens: maxTokens ?? env.llmMaxTokens,
        temperature: 0.3,
        response_format: responseFormat,
      },
      true,
      onNotice,
    );
    const data = (await res.json()) as ChatCompletion;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Model returned an empty response");
    return JSON.parse(stripFence(content));
  };

  try {
    return await attempt({
      type: "json_schema",
      json_schema: { name: jsonSchema.name, schema: jsonSchema.schema, strict: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/json_schema|response_format|strict|400/i.test(message)) throw error;

    messages[0].content = `${system}\n\nRespond with JSON only, matching this schema exactly:\n${JSON.stringify(jsonSchema.schema)}`;
    return attempt({ type: "json_object" });
  }
}

export async function* openAiStream(
  system: string,
  contextParts: ContentPart[],
  history: ChatMessage[],
  question: string,
): AsyncGenerator<string> {
  const res = await post({
    model: env.llmModel,
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

function stripFence(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : content).trim();
}
