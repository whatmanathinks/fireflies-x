import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  meetings,
  sentences as sentencesTable,
  speakers as speakersTable,
  workspaces,
} from "@/db/schema";
import { canReceiveWebhooks, env, hasDeepgram } from "@/lib/env";
import { PermanentError } from "@/lib/errors";
import { buildSentences, fixtureDuration } from "@/lib/fixtures/build";
import { fixtures } from "@/lib/fixtures/transcripts";
import { enqueue } from "@/lib/jobs";
import { fetchAudioBuffer, isPubliclyFetchable } from "@/lib/storage";
import {
  transcribeBufferSync,
  transcribeUrlAsync,
  utterancesToSentences,
  type DeepgramResponse,
} from "./deepgram";

export async function runTranscription(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) throw new Error("Meeting not found");
  if (!meeting.audioUrl) {
    throw new PermanentError("This meeting has no audio to transcribe.");
  }

  await db
    .update(meetings)
    .set({ status: "transcribing", updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));

  if (!hasDeepgram()) {
    await applyScriptedTranscript(meetingId);
    await enqueue(meetingId, "summarize");
    return;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, meeting.workspaceId),
  });
  const keyterms = workspace?.customVocabulary ?? [];

  if (canReceiveWebhooks() && isPubliclyFetchable(meeting.audioUrl)) {
    const callbackUrl = `${env.publicBaseUrl}/api/webhooks/deepgram?meetingId=${meetingId}&secret=${env.internalSecret}`;
    const { request_id } = await transcribeUrlAsync(meeting.audioUrl, callbackUrl, keyterms);
    await db
      .update(meetings)
      .set({ sttRequestId: request_id })
      .where(eq(meetings.id, meetingId));
    return;
  }

  const buffer = await fetchAudioBuffer(meeting.audioUrl);
  const payload = await transcribeBufferSync(
    buffer,
    meeting.mimeType ?? "audio/webm",
    keyterms,
  );
  await persistDeepgramResult(meetingId, payload);
  await enqueue(meetingId, "summarize");
}

export async function persistDeepgramResult(
  meetingId: string,
  payload: DeepgramResponse,
) {
  const parsed = utterancesToSentences(payload);
  if (!parsed.length) {
    throw new PermanentError(
      "No speech was detected in this audio, so there is nothing to transcribe.",
      "no_speech",
    );
  }

  await db.delete(sentencesTable).where(eq(sentencesTable.meetingId, meetingId));
  await db.delete(speakersTable).where(eq(speakersTable.meetingId, meetingId));

  const speakerIndices = [...new Set(parsed.map((p) => p.speakerIndex))].sort((a, b) => a - b);
  await db.insert(speakersTable).values(
    speakerIndices.map((idx) => ({
      meetingId,
      speakerIndex: idx,
      label: `Speaker ${idx + 1}`,
    })),
  );

  for (let i = 0; i < parsed.length; i += 200) {
    await db.insert(sentencesTable).values(
      parsed.slice(i, i + 200).map((s, j) => ({
        meetingId,
        index: i + j,
        speakerIndex: s.speakerIndex,
        speakerName: `Speaker ${s.speakerIndex + 1}`,
        text: s.text,
        rawText: s.text.toLowerCase().replace(/[.,!?]/g, ""),
        startMs: s.startMs,
        endMs: s.endMs,
        words: s.words,
      })),
    );
  }

  const durationMs =
    Math.round((payload.metadata?.duration ?? 0) * 1000) ||
    parsed[parsed.length - 1].endMs + 1000;

  await db
    .update(meetings)
    .set({ durationMs, updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));
}

export async function applyScriptedTranscript(meetingId: string, fixtureKey?: string) {
  const fixture =
    fixtures.find((f) => f.key === fixtureKey) ??
    fixtures[Math.floor(Math.random() * fixtures.length)];

  const built = buildSentences(fixture);

  await db.delete(sentencesTable).where(eq(sentencesTable.meetingId, meetingId));
  await db.delete(speakersTable).where(eq(speakersTable.meetingId, meetingId));

  await db.insert(speakersTable).values(
    fixture.speakers.map((name, i) => ({
      meetingId,
      speakerIndex: i,
      label: `Speaker ${i + 1}`,
      displayName: name,
    })),
  );

  for (let i = 0; i < built.length; i += 200) {
    await db.insert(sentencesTable).values(
      built.slice(i, i + 200).map((s) => ({
        meetingId,
        index: s.index,
        speakerIndex: s.speakerIndex,
        speakerName: s.speakerName,
        text: s.text,
        rawText: s.rawText,
        startMs: s.startMs,
        endMs: s.endMs,
        words: s.words,
      })),
    );
  }

  await db
    .update(meetings)
    .set({
      durationMs: fixtureDuration(built),
      participants: fixture.participants,
      updatedAt: new Date(),
    })
    .where(eq(meetings.id, meetingId));

  return fixture;
}

export async function transcriptLineCount(meetingId: string) {
  const rows = await db
    .select({ index: sentencesTable.index })
    .from(sentencesTable)
    .where(eq(sentencesTable.meetingId, meetingId))
    .orderBy(asc(sentencesTable.index));
  return rows.length;
}
