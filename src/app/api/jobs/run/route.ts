import { after } from "next/server";
import { fail, isInternalRequest, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { nextDueInMs, runDueJobs } from "@/lib/jobs";

export const maxDuration = 300;

const MAX_CHAIN_DEPTH = 60;
const BUDGET_MS = 200_000;
const LOOKAHEAD_MS = 30_000;
const CHAIN_HORIZON_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  if (!isInternalRequest(request)) return fail("Unauthorized", 401);

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 3);
  const depth = Number(url.searchParams.get("depth") ?? 0);

  const startedAt = Date.now();
  const results: Awaited<ReturnType<typeof runDueJobs>> = [];
  let waitMs: number | null = null;

  for (;;) {
    results.push(...(await runDueJobs(limit)));

    waitMs = await nextDueInMs();
    if (waitMs === null) break;
    if (waitMs <= 0) continue;

    const elapsed = Date.now() - startedAt;
    if (waitMs > LOOKAHEAD_MS || elapsed + waitMs > BUDGET_MS) break;

    await sleep(waitMs + 250);
  }

  const shouldChain =
    waitMs !== null && waitMs < CHAIN_HORIZON_MS && depth < MAX_CHAIN_DEPTH;

  if (shouldChain) {
    after(async () => {
      if (waitMs !== null && waitMs > 0) await sleep(Math.min(waitMs, LOOKAHEAD_MS));
      try {
        await fetch(
          `${env.publicBaseUrl}/api/jobs/run?secret=${env.internalSecret}&limit=${limit}&depth=${depth + 1}`,
          { method: "POST" },
        );
      } catch {
        /* the cron sweeper is the backstop */
      }
    });
  }

  return ok({ ran: results.length, results, depth, nextDueInMs: waitMs });
}

export const GET = POST;
