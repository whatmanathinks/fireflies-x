import { GlobalAskFred } from "@/components/askfred/global-askfred";
import { requireSession } from "@/lib/auth";
import { providerLabel } from "@/lib/ai/provider";
import { listMeetings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AskFredPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await requireSession();
  const meetings = await listMeetings(session.workspaceId, session.userId);

  return (
    <GlobalAskFred
      initialQuestion={q ?? ""}
      meetingCount={meetings.length}
      provider={providerLabel()}
    />
  );
}
