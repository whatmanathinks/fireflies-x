import { fail, isInternalRequest, ok } from "@/lib/api";
import { runDueJobs } from "@/lib/jobs";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isInternalRequest(request)) return fail("Unauthorized", 401);
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 3);
  return ok({ results: await runDueJobs(limit) });
}

export const GET = POST;
