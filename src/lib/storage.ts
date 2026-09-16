import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { env, hasBlob } from "@/lib/env";

const LOCAL_DIR = join(process.cwd(), ".data", "media");

export async function putAudio(key: string, body: Buffer, contentType: string) {
  if (hasBlob()) {
    const blob = await put(key, body, {
      access: "public",
      contentType,
      addRandomSuffix: true,
      ...(env.blobToken ? { token: env.blobToken } : {}),
    });
    return blob.url;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  await writeFile(join(LOCAL_DIR, safe), body);
  return `${env.publicBaseUrl}/api/media/${encodeURIComponent(safe)}`;
}

export async function readLocalAudio(name: string) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return readFile(join(LOCAL_DIR, safe));
}

export function isLocalMediaUrl(url: string) {
  return url.includes("/api/media/");
}

export async function fetchAudioBuffer(url: string) {
  if (isLocalMediaUrl(url)) {
    const name = decodeURIComponent(url.split("/api/media/")[1] ?? "");
    return readLocalAudio(name);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch audio (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export function isPubliclyFetchable(url: string) {
  return /^https:\/\//.test(url) && !isLocalMediaUrl(url);
}
