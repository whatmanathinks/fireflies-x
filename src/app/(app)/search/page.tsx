import { SearchView } from "@/components/search/search-view";
import { requireSession } from "@/lib/auth";
import { filterHits, searchTranscripts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q, filter } = await searchParams;
  const session = await requireSession();

  const validFilters = ["task", "question", "metric", "pricing", "date_and_time"] as const;
  const activeFilter = validFilters.find((f) => f === filter) ?? null;

  const hits = activeFilter
    ? await filterHits(session.workspaceId, activeFilter, 150)
    : q
      ? await searchTranscripts(session.workspaceId, q, 100)
      : [];

  return (
    <SearchView
      query={q ?? ""}
      filter={activeFilter}
      hits={hits.map((h) => ({
        meetingId: h.meetingId,
        meetingTitle: h.meetingTitle,
        meetingDate: new Date(h.meetingDate).toISOString(),
        index: h.index,
        speakerName: h.speakerName,
        text: h.text,
        startMs: h.startMs,
      }))}
    />
  );
}
