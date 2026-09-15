import { fail, isInternalRequest, ok } from "@/lib/api";
import { runDueJobs } from "@/lib/jobs";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isInternalRequest(request)) return fail("Unauthorized", 401);
  return ok({ swept: await runDueJobs(5) });
}
