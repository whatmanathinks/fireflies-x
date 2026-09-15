import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "@/lib/env";
import type { ChatMessage, ContentPart } from "../provider";

let client: Anthropic | null = null;

function anthropic() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

function toBlocks(parts: ContentPart[]) {
  return parts.map((part) => ({
    type: "text" as const,
    text: part.text,
    ...(part.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

export async function anthropicJson<T>(
  schema: z.ZodType<T>,
  system: string,
  parts: ContentPart[],
): Promise<T> {
  const response = await anthropic().messages.parse({
    model: env.anthropicModel,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: toBlocks(parts) }],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (!response.parsed_output) throw new Error("Model returned unparseable output");
  return response.parsed_output;
}

export async function* anthropicStream(
  system: string,
  contextParts: ContentPart[],
  history: ChatMessage[],
  question: string,
): AsyncGenerator<string> {
  const stream = anthropic().messages.stream({
    model: env.anthropicModel,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      { role: "user", content: toBlocks(contextParts) },
      { role: "assistant", content: "Ready." },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: question },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta" &&
      event.delta.text
    ) {
      yield event.delta.text;
    }
  }
}
