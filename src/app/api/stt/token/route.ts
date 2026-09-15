import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { hasDeepgram } from "@/lib/env";
import { grantLiveToken } from "@/lib/stt/deepgram";

export async function POST() {
  if (!hasDeepgram()) {
    return fail("Live transcription unavailable: DEEPGRAM_API_KEY is not set", 503);
  }
  return handle(async () => {
    await requireSession();
    const grant = await grantLiveToken(60);
    return { accessToken: grant.access_token, expiresIn: grant.expires_in };
  });
}
