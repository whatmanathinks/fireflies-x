import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { auth } from "@/lib/auth";
import { demoMode, hasBlob, hasDeepgram, hasRecall } from "@/lib/env";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  const workspace = workspaceId
    ? await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) })
    : null;

  return (
    <AppShell
      user={{
        name: session.user.name ?? "You",
        email: session.user.email ?? "",
        image: session.user.image ?? null,
        workspaceName: workspace?.name ?? "Workspace",
      }}
      demoMode={demoMode()}
      liveEnabled={hasDeepgram()}
      blobEnabled={hasBlob()}
      blobPresigned={hasBlob() && !process.env.BLOB_READ_WRITE_TOKEN}
      realNotetaker={hasRecall()}
    >
      {children}
    </AppShell>
  );
}
