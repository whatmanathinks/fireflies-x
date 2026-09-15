import { renderTranscript, type TranscriptLine } from "./client";
import { streamText, type ChatMessage } from "./provider";

const SYSTEM = `You are Fred, an assistant that answers questions about meetings the user has recorded.

You are given the full transcript. Every line is prefixed with its index and timestamp as [index] (mm:ss).

How to answer:
- Answer only from the transcript. If the transcript does not contain the answer, say so plainly - do not speculate or fill gaps with plausible-sounding detail.
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
) {
  const transcript = renderTranscript(lines);

  yield* streamText(
    SYSTEM,
    [
      { text: `Meeting: ${meetingTitle}\n\nTranscript:\n\n${transcript}`, cache: true },
      { text: "I will ask questions about this meeting." },
    ],
    history,
    question,
  );
}

export async function* streamWorkspaceAnswer(
  excerpts: { meetingTitle: string; meetingId: string; lines: TranscriptLine[] }[],
  history: ChatTurn[],
  question: string,
) {
  const body = excerpts
    .map(
      (e) =>
        `### Meeting: ${e.meetingTitle} (id ${e.meetingId})\n${renderTranscript(e.lines)}`,
    )
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
