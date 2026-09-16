import { env } from "@/lib/env";

export type PoolEndpoint = {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  /** 0 is used first and load-balanced; higher tiers are fallbacks. */
  tier: number;
};

export type Candidate = {
  endpoint: PoolEndpoint;
  model: string;
};

let cached: PoolEndpoint[] | null = null;

function fromLegacyEnv(): PoolEndpoint[] {
  if (!env.llmApiKey || !env.llmBaseUrl) return [];
  return [
    {
      name: "llm",
      baseUrl: env.llmBaseUrl,
      apiKey: env.llmApiKey,
      models: [env.llmModel, ...env.llmFallbackModels].filter(Boolean),
      tier: 0,
    },
  ];
}

export function pool(): PoolEndpoint[] {
  if (cached) return cached;

  if (env.llmPoolRaw.trim()) {
    try {
      const parsed = JSON.parse(env.llmPoolRaw) as Partial<PoolEndpoint>[];
      const endpoints = parsed
        .filter((e) => e.baseUrl && e.apiKey && e.models?.length)
        .map((e, i) => ({
          name: e.name ?? `endpoint-${i + 1}`,
          baseUrl: e.baseUrl!,
          apiKey: e.apiKey!,
          models: e.models!,
          tier: e.tier ?? 0,
        }));
      if (endpoints.length) {
        cached = endpoints;
        return cached;
      }
    } catch {
      console.warn("[llm] LLM_POOL is not valid JSON; falling back to LLM_API_KEY");
    }
  }

  cached = fromLegacyEnv();
  return cached;
}

export function hasPool() {
  return pool().length > 0;
}

/**
 * Candidates in the order they should be tried. Tier 0 endpoints are rotated so
 * consecutive calls start on different keys, spreading load across their separate
 * quotas rather than draining one before touching the next.
 */
export function candidates(rotation: number): Candidate[] {
  const endpoints = pool();
  const tiers = [...new Set(endpoints.map((e) => e.tier))].sort((a, b) => a - b);
  const out: Candidate[] = [];

  for (const tier of tiers) {
    const inTier = endpoints.filter((e) => e.tier === tier);
    const offset = tier === 0 && inTier.length > 1 ? rotation % inTier.length : 0;
    const ordered = [...inTier.slice(offset), ...inTier.slice(0, offset)];
    for (const endpoint of ordered) {
      for (const model of endpoint.models) out.push({ endpoint, model });
    }
  }

  return out;
}

export function primaryLabel() {
  const first = pool()[0];
  if (!first) return "";
  return first.models[0];
}

export function poolSummary() {
  return pool().map((e) => `${e.name}(${e.models.length} models, tier ${e.tier})`).join(", ");
}
