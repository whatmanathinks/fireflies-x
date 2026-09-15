export const BOT_STATE_LABEL: Record<string, string> = {
  idle: "Queued",
  joining: "Joining the call…",
  waiting_for_host: "Waiting to be admitted to the call…",
  in_call: "In the call, recording",
  leaving: "Leaving the call…",
  processing: "Processing recording…",
  done: "Finished",
  failed: "Failed to join",
};

export const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  recording: "Recording",
  uploading: "Uploading",
  transcribing: "Transcribing",
  summarizing: "Writing notes",
  completed: "Ready",
  failed: "Failed",
};

export const SOURCE_LABEL: Record<string, string> = {
  browser: "Browser recording",
  upload: "Uploaded file",
  bot_sim: "Notetaker bot (simulated)",
  seed: "Sample meeting",
};
