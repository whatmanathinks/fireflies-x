import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const bodySchema = z.object({
  status: z.enum(["open", "done"]).optional(),
  assignee: z.string().max(120).nullable().optional(),
  dueDate: z.string().max(60).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid body");

  return handle(async () => {
    const session = await requireSession();
    await db
      .update(tasks)
      .set(parsed.data)
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, session.workspaceId)));
    return { ok: true };
  });
}
