import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { hasBlob, hasDeepgram, hasRecall } from "@/lib/env";
import { canStreamLive } from "@/lib/stt/deepgram";

export async function GET() {
  return handle(async () => {
    await requireSession();
    const live = hasDeepgram()
      ? await canStreamLive()
      : { ok: false, reason: "DEEPGRAM_API_KEY is not set" };

    return {
      transcription: hasDeepgram(),
      liveTranscription: live.ok,
      liveTranscriptionReason: live.reason,
      blobStorage: hasBlob(),
      realNotetaker: hasRecall(),
    };
  });
}
