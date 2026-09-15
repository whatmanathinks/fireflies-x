import { sql } from "drizzle-orm";
import { db } from "@/db";
import { providerLabel } from "@/lib/ai/provider";
import { canReceiveWebhooks, hasBlob, hasDeepgram, hasGoogle } from "@/lib/env";

export async function GET() {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }

  return Response.json(
    {
      ok: database,
      database,
      speechToText: hasDeepgram() ? "deepgram" : "scripted",
      languageModel: providerLabel(),
      mediaStorage: hasBlob() ? "vercel-blob" : "local-disk",
      googleAuth: hasGoogle(),
      asyncTranscription: canReceiveWebhooks(),
    },
    { status: database ? 200 : 503 },
  );
}
