import { env } from "@/lib/env";

export type RecallStatusCode =
  | "joining_call"
  | "in_waiting_room"
  | "in_call_not_recording"
  | "recording_permission_allowed"
  | "recording_permission_denied"
  | "in_call_recording"
  | "call_ended"
  | "done"
  | "fatal";

export type RecallBot = {
  id: string;
  meeting_url?: unknown;
  bot_name?: string;
  status_changes?: { code: string; sub_code: string | null; message?: string; created_at: string }[];
  recordings?: {
    id?: string;
    media_shortcuts?: Record<
      string,
      { data?: { download_url?: string }; expires_at?: string } | null
    >;
  }[];
};

function baseUrl() {
  return `https://${env.recallRegion}.recall.ai/api/v1`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${env.recallApiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Recall.ai ${init?.method ?? "GET"} ${path} failed (${res.status}): ${detail.slice(0, 400)}`);
  }

  return (await res.json()) as T;
}

export async function createBot(meetingUrl: string, botName: string, meetingId: string) {
  return call<RecallBot>("/bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botName,
      recording_config: {
        audio_mixed_mp3: {},
        start_recording_on: "participant_join",
      },
      metadata: { meetingId },
    }),
  });
}

export async function getBot(botId: string) {
  return call<RecallBot>(`/bot/${botId}/`);
}

export async function leaveCall(botId: string) {
  return call<unknown>(`/bot/${botId}/leave_call/`, { method: "POST" });
}

export function latestStatus(bot: RecallBot) {
  const changes = bot.status_changes ?? [];
  if (!changes.length) return null;
  return changes[changes.length - 1];
}

export function audioDownloadUrl(bot: RecallBot) {
  for (const recording of bot.recordings ?? []) {
    const shortcuts = recording.media_shortcuts ?? {};
    for (const key of ["audio_mixed", "video_mixed"]) {
      const url = shortcuts[key]?.data?.download_url;
      if (url) return url;
    }
  }
  return null;
}

const STATE_BY_CODE: Record<string, string> = {
  joining_call: "joining",
  in_waiting_room: "waiting_for_host",
  in_call_not_recording: "in_call",
  recording_permission_allowed: "in_call",
  recording_permission_denied: "failed",
  in_call_recording: "in_call",
  call_ended: "leaving",
  done: "processing",
  fatal: "failed",
};

export function mapBotState(code: string | undefined) {
  if (!code) return "joining";
  return STATE_BY_CODE[code.replace(/^bot\./, "")] ?? "joining";
}

export const TERMINAL_CODES = new Set(["done", "fatal", "recording_permission_denied"]);

export function everRecorded(bot: RecallBot) {
  return (bot.status_changes ?? []).some((s) =>
    s.code.replace(/^bot\./, "") === "in_call_recording",
  );
}

export function wasAdmitted(bot: RecallBot) {
  return (bot.status_changes ?? []).some((s) =>
    ["in_call_recording", "in_call_not_recording"].includes(s.code.replace(/^bot\./, "")),
  );
}
