import { issueSignedToken } from "@vercel/blob";
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { env, hasBlob } from "@/lib/env";

const ALLOWED_CONTENT_TYPES = [
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav",
  "audio/x-wav", "audio/x-m4a", "audio/aac", "audio/flac",
  "video/mp4", "video/webm", "video/quicktime",
];

const MAX_BYTES = 512 * 1024 * 1024;

export async function POST(request: Request) {
  if (!hasBlob()) return fail("Blob storage is not configured", 503);

  const body = (await request.json()) as HandleUploadBody & HandleUploadPresignedBody;

  try {
    if (env.blobToken) {
      const jsonResponse = await handleUpload({
        body: body as HandleUploadBody,
        request,
        token: env.blobToken,
        onBeforeGenerateToken: async () => {
          const session = await requireSession();
          return {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            addRandomSuffix: true,
            maximumSizeInBytes: MAX_BYTES,
            tokenPayload: JSON.stringify({ userId: session.userId }),
          };
        },
        onUploadCompleted: async () => {},
      });
      return ok(jsonResponse);
    }

    const jsonResponse = await handleUploadPresigned({
      body: body as HandleUploadPresignedBody,
      request,
      getSignedToken: async (pathname) => {
        await requireSession();
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          validUntil: Date.now() + 60 * 60 * 1000,
        });
        return { token, urlOptions: { addRandomSuffix: true } };
      },
    });
    return ok(jsonResponse);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Upload failed", 400);
  }
}
