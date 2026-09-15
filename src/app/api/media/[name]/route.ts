import { readLocalAudio } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  try {
    const buffer = await readLocalAudio(decodeURIComponent(name));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": name.endsWith(".mp3")
          ? "audio/mpeg"
          : name.endsWith(".mp4")
            ? "video/mp4"
            : "audio/webm",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
