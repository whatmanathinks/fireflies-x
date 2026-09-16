import { fail, isInternalRequest, ok } from "@/lib/api";
import { pruneOldSandboxes } from "@/lib/demo";
import { runDueJobs } from "@/lib/jobs";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isInternalRequest(request)) return fail("Unauthorized", 401);
  const swept = await runDueJobs(5);
  const pruned = await pruneOldSandboxes();
  return ok({ swept, prunedSandboxes: pruned });
}
