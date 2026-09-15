import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { hasBlob, hasDeepgram, hasRecall } from "@/lib/env";

export async function GET() {
  return handle(async () => {
    await requireSession();
    return {
      liveTranscription: hasDeepgram(),
      blobStorage: hasBlob(),
      realNotetaker: hasRecall(),
    };
  });
}
