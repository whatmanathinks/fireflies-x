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
      blobPresigned: hasBlob() && !process.env.BLOB_READ_WRITE_TOKEN,
      realNotetaker: hasRecall(),
    };
  });
}
