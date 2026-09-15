import { handle } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { listMeetings, searchTranscripts } from "@/lib/queries";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  return handle(async () => {
    const session = await requireSession();
    if (!query) {
      const recent = await listMeetings(session.workspaceId, session.userId);
      return { meetings: recent.slice(0, 6), moments: [] };
    }

    const [meetings, moments] = await Promise.all([
      listMeetings(session.workspaceId, session.userId, { query }),
      searchTranscripts(session.workspaceId, query, 12),
    ]);

    return { meetings: meetings.slice(0, 6), moments };
  });
}
