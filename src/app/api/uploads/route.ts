import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { env, hasBlob } from "@/lib/env";

export async function POST(request: Request) {
  if (!hasBlob()) return fail("Blob storage is not configured", 503);

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: env.blobToken,
      onBeforeGenerateToken: async () => {
        const session = await requireSession();
        return {
          allowedContentTypes: [
            "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav",
            "audio/x-m4a", "audio/aac", "audio/flac",
            "video/mp4", "video/webm", "video/quicktime",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 512 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId: session.userId }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return ok(jsonResponse);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Upload failed", 400);
  }
}
