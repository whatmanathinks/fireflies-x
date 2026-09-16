import { z } from "zod";
import { env } from "@/lib/env";

export type ProviderId = "anthropic" | "openai-compatible" | "none";

export type ContentPart = { text: string; cache?: boolean };

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function activeProvider(): ProviderId {
  if (env.forceDemo) return "none";
  if (env.anthropicApiKey) return "anthropic";
  if (env.llmApiKey && env.llmBaseUrl) return "openai-compatible";
  return "none";
}

export function providerLabel() {
  const provider = activeProvider();
  if (provider === "anthropic") return `Anthropic ${env.anthropicModel}`;
  if (provider === "openai-compatible") return env.llmModel;
  return "Scripted (no LLM key)";
}

export function hasLlm() {
  return activeProvider() !== "none";
}

function jsonSchemaFor(schema: z.ZodType, name: string) {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  delete json.$schema;
  return { name, schema: json };
}

export async function generateJson<T>(
  schema: z.ZodType<T>,
  schemaName: string,
  system: string,
  parts: ContentPart[],
  maxTokens?: number,
): Promise<T> {
  const provider = activeProvider();

  if (provider === "anthropic") {
    const { anthropicJson } = await import("./providers/anthropic");
    return anthropicJson(schema, system, parts);
  }

  if (provider === "openai-compatible") {
    const { openAiJson } = await import("./providers/openai-compatible");
    const raw = await openAiJson(jsonSchemaFor(schema, schemaName), system, parts, maxTokens);
    return schema.parse(raw);
  }

  throw new Error("No LLM provider configured");
}

export async function* streamText(
  system: string,
  contextParts: ContentPart[],
  history: ChatMessage[],
  question: string,
): AsyncGenerator<string> {
  const provider = activeProvider();

  if (provider === "anthropic") {
    const { anthropicStream } = await import("./providers/anthropic");
    yield* anthropicStream(system, contextParts, history, question);
    return;
  }

  if (provider === "openai-compatible") {
    const { openAiStream } = await import("./providers/openai-compatible");
    yield* openAiStream(system, contextParts, history, question);
    return;
  }

  throw new Error("No LLM provider configured");
}
