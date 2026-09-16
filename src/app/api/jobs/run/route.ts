import { after } from "next/server";
import { fail, isInternalRequest, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { hasDueWork, runDueJobs } from "@/lib/jobs";

export const maxDuration = 300;

const MAX_CHAIN_DEPTH = 12;

export async function POST(request: Request) {
  if (!isInternalRequest(request)) return fail("Unauthorized", 401);

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 3);
  const depth = Number(url.searchParams.get("depth") ?? 0);

  const results = await runDueJobs(limit);

  if (depth < MAX_CHAIN_DEPTH && (await hasDueWork())) {
    after(async () => {
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

  return ok({ results, chained: depth });
}

export const GET = POST;
