import { groupIntoTurns, renderTurns } from "./chunking";
import type { TranscriptLine } from "./client";
import { streamText, type ChatMessage } from "./provider";

const SYSTEM = `You are Fred, an assistant that answers questions about meetings the user has recorded.

You are given the full transcript. Every line is prefixed with its index and timestamp as [index] (mm:ss).

How to answer:
- Answer only from what you were given. If it does not contain the answer, say so plainly - do not speculate or fill gaps with plausible-sounding detail.
- For a long meeting you may be given the meeting's notes plus the excerpts most relevant to the question, rather than the whole transcript. If the excerpts do not settle the question, say which part of the meeting you would need rather than guessing.
- Cite the moment you are drawing on by writing the timestamp in the form [t=mm:ss] immediately after the claim. Use the timestamp of the line you are actually using.
- Be concise and direct. Lead with the answer, then the supporting detail.
- Quote the speaker verbatim when the exact wording matters (commitments, numbers, decisions).
- Attribute claims to the person who said them.
- Plain prose and short lists. No headings.`;

const MULTI_SYSTEM = `You are Fred, an assistant that answers questions across all of a user's recorded meetings.

You are given excerpts from several meetings. Each excerpt block names its meeting and each line is prefixed as [index] (mm:ss).

How to answer:
- Answer only from the excerpts provided. If they do not contain the answer, say so.
- Name the meeting you are drawing on, and cite the moment as [t=mm:ss] after the claim.
- Be concise. Lead with the answer.
- When several meetings touch the question, say how they differ rather than blending them.`;

export type ChatTurn = ChatMessage;

export async function* streamMeetingAnswer(
  lines: TranscriptLine[],
  meetingTitle: string,
  history: ChatTurn[],
  question: string,
  options?: { partial?: boolean; summaryDigest?: string | null },
) {
  const transcript = renderTurns(groupIntoTurns(lines));
  const header = options?.partial
    ? `Meeting: ${meetingTitle}\n\nThis meeting is long, so you are given its notes followed by the transcript excerpts most relevant to the question.`
    : `Meeting: ${meetingTitle}`;

  const parts: { text: string; cache?: boolean }[] = [{ text: header }];
  if (options?.summaryDigest) {
    parts.push({ text: `Meeting notes:\n\n${options.summaryDigest}` });
  }
  parts.push({
    text: `Transcript${options?.partial ? " excerpts" : ""}. Each line is "#index mm:ss Speaker: text":\n\n${transcript}`,
    cache: true,
  });
  parts.push({ text: "I will ask questions about this meeting." });

  yield* streamText(SYSTEM, parts, history, question);
}

export async function* streamWorkspaceAnswer(
  excerpts: {
    meetingTitle: string;
    meetingId: string;
    lines: TranscriptLine[];
    summaryDigest?: string | null;
  }[],
  history: ChatTurn[],
  question: string,
) {
  const body = excerpts
    .map((e) => {
      const blocks = [`### Meeting: ${e.meetingTitle} (id ${e.meetingId})`];
      if (e.summaryDigest) blocks.push(`Notes:\n${e.summaryDigest}`);
      blocks.push(renderTurns(groupIntoTurns(e.lines)));
      return blocks.join("\n");
    })
    .join("\n\n");

  yield* streamText(
    MULTI_SYSTEM,
    [
      { text: `Excerpts:\n\n${body}`, cache: true },
      { text: "I will ask questions about these meetings." },
    ],
    history,
    question,
  );
}

export function fallbackAnswer(lines: TranscriptLine[], question: string) {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 3);

  const scored = lines
    .map((l) => {
      const lower = l.text.toLowerCase();
      const score = terms.reduce((acc, t) => acc + (lower.includes(t) ? 1 : 0), 0);
      return { line: l, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (!scored.length) {
    return `I could not find anything in this transcript about that.\n\n_AskFred is running without an ANTHROPIC_API_KEY, so this is keyword matching rather than a real answer._`;
  }

  const body = scored
    .map((s) => {
      const total = Math.floor(s.line.startMs / 1000);
      const stamp = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      return `- **${s.line.speakerName}**: "${s.line.text}" [t=${stamp}]`;
    })
    .join("\n");

  return `Here are the moments that mention that:\n\n${body}\n\n_AskFred is running without an ANTHROPIC_API_KEY, so this is keyword matching rather than a real answer._`;
}
