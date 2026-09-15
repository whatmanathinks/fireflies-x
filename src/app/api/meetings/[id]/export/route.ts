import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sentences, speakers, summaries } from "@/db/schema";
import { fail } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { getMeeting } from "@/lib/queries";
import { formatTimecode, slugify } from "@/lib/utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "md";

  let session;
  try {
    session = await requireSession();
  } catch {
    return fail("Unauthorized", 401);
  }

  const meeting = await getMeeting(id, session.workspaceId);
  if (!meeting) return fail("Meeting not found", 404);

  const [rows, speakerRows, summary] = await Promise.all([
    db.select().from(sentences).where(eq(sentences.meetingId, id)).orderBy(asc(sentences.index)),
    db.select().from(speakers).where(eq(speakers.meetingId, id)),
    db.query.summaries.findFirst({ where: eq(summaries.meetingId, id) }),
  ]);

  const nameFor = new Map(speakerRows.map((s) => [s.speakerIndex, s.displayName ?? s.label]));
  const slug = slugify(meeting.title) || "meeting";

  if (format === "txt") {
    const body = rows
      .map((r) => `[${formatTimecode(r.startMs)}] ${nameFor.get(r.speakerIndex) ?? r.speakerName}: ${r.text}`)
      .join("\n");
    return new Response(`${meeting.title}\n${new Date(meeting.date).toLocaleString()}\n\n${body}\n`, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-transcript.txt"`,
      },
    });
  }

  const lines: string[] = [
    `# ${meeting.title}`,
    "",
    `**Date:** ${new Date(meeting.date).toLocaleString()}  `,
    `**Duration:** ${formatTimecode(meeting.durationMs)}  `,
    `**Participants:** ${meeting.participants.join(", ")}`,
    "",
  ];

  if (summary) {
    if (summary.gist) lines.push(`> ${summary.gist}`, "");
    if (summary.keywords.length) lines.push(`**Keywords:** ${summary.keywords.join(" · ")}`, "");
    if (summary.bulletGist.length) {
      lines.push("## Key takeaways", "", ...summary.bulletGist.map((b) => `- ${b}`), "");
    }
    if (summary.overview) lines.push("## Overview", "", summary.overview, "");
    if (summary.outline.length) {
      lines.push("## Outline", "");
      for (const chapter of summary.outline) {
        lines.push(`### ${formatTimecode(chapter.startMs)} — ${chapter.title}`, "", chapter.summary, "");
      }
    }
    if (summary.actionItems.length) {
      lines.push("## Action items", "");
      for (const item of summary.actionItems) {
        const meta = [item.assignee, item.dueDate].filter(Boolean).join(" · ");
        lines.push(`- [ ] ${item.text}${meta ? ` _(${meta})_` : ""}`);
      }
      lines.push("");
    }
  }

  lines.push("## Transcript", "");
  let lastSpeaker = -1;
  for (const row of rows) {
    const name = nameFor.get(row.speakerIndex) ?? row.speakerName;
    if (row.speakerIndex !== lastSpeaker) {
      lines.push("", `**${name}** \`${formatTimecode(row.startMs)}\``, "");
      lastSpeaker = row.speakerIndex;
    }
    lines.push(row.text);
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-notes.md"`,
    },
  });
}
