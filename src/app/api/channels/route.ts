import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { slugify } from "@/lib/utils";

const bodySchema = z.object({
  title: z.string().min(1).max(60),
  isPrivate: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid body");

  return handle(async () => {
    const session = await requireSession();
    const slug = slugify(parsed.data.title) || `channel-${Date.now()}`;
    const [channel] = await db
      .insert(channels)
      .values({
        workspaceId: session.workspaceId,
        title: parsed.data.title,
        slug,
        isPrivate: parsed.data.isPrivate ?? false,
        createdBy: session.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!channel) throw new Error("A channel with that name already exists");
    return channel;
  });
}

export async function DELETE(request: Request) {
  const channelId = new URL(request.url).searchParams.get("channelId");
  if (!channelId) return fail("channelId is required");

  return handle(async () => {
    const session = await requireSession();
    await db
      .delete(channels)
      .where(and(eq(channels.id, channelId), eq(channels.workspaceId, session.workspaceId)));
    return { ok: true };
  });
}
