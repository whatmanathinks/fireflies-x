import { env } from "@/lib/env";
import type { ChatMessage, ContentPart } from "../provider";

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

async function post(body: Record<string, unknown>) {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${env.llmModel} request failed (${res.status}): ${detail.slice(0, 400)}`);
  }
  return res;
}

export async function openAiJson(
  jsonSchema: { name: string; schema: Record<string, unknown> },
  system: string,
  parts: ContentPart[],
): Promise<unknown> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: joinParts(parts) },
  ];

  const attempt = async (responseFormat: Record<string, unknown>) => {
    const res = await post({
      model: env.llmModel,
      messages,
      max_tokens: 16000,
      temperature: 0.3,
      response_format: responseFormat,
    });
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
    max_tokens: 4000,
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
