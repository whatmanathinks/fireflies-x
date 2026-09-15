import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workspaceMembers, workspaces } from "@/db/schema";

export const DEFAULT_CHANNELS = [
  { slug: "all", title: "All Meetings", icon: "inbox" },
  { slug: "mine", title: "My Meetings", icon: "user" },
  { slug: "uploads", title: "Uploads", icon: "upload" },
] as const;

export type DefaultChannelSlug = (typeof DEFAULT_CHANNELS)[number]["slug"];

export async function ensureWorkspace(userId: string) {
  const membership = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, userId),
  });
  if (membership) {
    const ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, membership.workspaceId),
    });
    if (ws) return ws;
  }

  const owned = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
  });
  if (owned) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: owned.id, userId, role: "owner" })
      .onConflictDoNothing();
    return owned;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const label = user?.name ? `${user.name.split(" ")[0]}'s Workspace` : "My Workspace";

  const [created] = await db
    .insert(workspaces)
    .values({ name: label, ownerId: userId })
    .returning();

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: created.id, userId, role: "owner" })
    .onConflictDoNothing();

  return created;
}
