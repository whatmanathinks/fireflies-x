const truthy = (v: string | undefined) => v === "1" || v === "true";

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  authSecret: process.env.AUTH_SECRET ?? "",
  googleClientId: process.env.AUTH_GOOGLE_ID ?? "",
  googleClientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmBaseUrl: process.env.LLM_BASE_URL ?? "",
  llmModel: process.env.LLM_MODEL ?? "",
  llmMaxTokens: Number(process.env.LLM_MAX_TOKENS ?? 3500),
  llmReasoningEffort: process.env.LLM_REASONING_EFFORT ?? "low",
  blobToken: process.env.BLOB_READ_WRITE_TOKEN ?? "",
  internalSecret: process.env.INTERNAL_JOB_SECRET ?? "dev-internal-secret",
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
  forceDemo: truthy(process.env.DEMO_MODE),
};

export const hasDeepgram = () => !!env.deepgramApiKey && !env.forceDemo;
export const hasAnthropic = () =>
  !env.forceDemo && (!!env.anthropicApiKey || (!!env.llmApiKey && !!env.llmBaseUrl));
export const hasBlob = () => !!env.blobToken;
export const hasGoogle = () => !!env.googleClientId && !!env.googleClientSecret;

export const isLocalHost = () =>
  env.publicBaseUrl.includes("localhost") ||
  env.publicBaseUrl.includes("127.0.0.1");

export const canReceiveWebhooks = () => !isLocalHost();

export const demoMode = () => !hasDeepgram() || !hasAnthropic();

export const missingKeys = () => {
  const missing: string[] = [];
  if (!env.databaseUrl) missing.push("DATABASE_URL");
  if (!env.deepgramApiKey) missing.push("DEEPGRAM_API_KEY");
  if (!hasAnthropic()) missing.push("ANTHROPIC_API_KEY (or LLM_API_KEY + LLM_BASE_URL)");
  if (!hasGoogle()) missing.push("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET");
  if (!env.blobToken) missing.push("BLOB_READ_WRITE_TOKEN");
  return missing;
};
