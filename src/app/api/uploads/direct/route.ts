import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { putAudio } from "@/lib/storage";

export const maxDuration = 300;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("No file provided");

  return handle(async () => {
    await requireSession();
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await putAudio(
      `${Date.now()}-${file.name || "recording.webm"}`,
      buffer,
      file.type || "audio/webm",
    );
    return { url, contentType: file.type || "audio/webm", size: buffer.length };
  });
}
