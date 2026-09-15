import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const bodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  defaultPrivacy: z.enum(["private", "workspace", "public"]).optional(),
  defaultTemplate: z.string().max(40).optional(),
  language: z.string().max(10).optional(),
  customVocabulary: z.array(z.string().max(60)).max(200).optional(),
  autoJoinMode: z.enum(["all", "owned", "manual"]).optional(),
});

export async function PATCH(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid body");

  return handle(async () => {
    const session = await requireSession();
    await db
      .update(workspaces)
      .set(parsed.data)
      .where(eq(workspaces.id, session.workspaceId));
    return { ok: true };
  });
}
