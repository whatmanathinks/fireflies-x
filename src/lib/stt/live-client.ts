export type LiveSentence = {
  speakerIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  words: { w: string; s: number; e: number }[];
};

type DGWord = {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
};

type DGMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: { transcript?: string; words?: DGWord[] }[] };
};

export type LiveClientOptions = {
  sampleRate: number;
  onInterim: (text: string, speakerIndex: number) => void;
  onSentence: (sentence: LiveSentence) => void;
  onError: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export class DeepgramLiveClient {
  private socket: WebSocket | null = null;
  private pending: DGWord[] = [];
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(private options: LiveClientOptions) {}

  async connect() {
    const res = await fetch("/api/stt/token", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Token request failed" }));
      throw new Error(body.error ?? "Could not start live transcription");
    }
    const { accessToken } = (await res.json()) as { accessToken: string };

    const params = new URLSearchParams({
      model: "nova-3",
      language: "en",
      encoding: "linear16",
      sample_rate: String(this.options.sampleRate),
      channels: "1",
      smart_format: "true",
      punctuate: "true",
      diarize: "true",
      interim_results: "true",
      utterance_end_ms: "1000",
      vad_events: "true",
      access_token: accessToken,
    });

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`);
      socket.binaryType = "arraybuffer";

      const timeout = setTimeout(() => {
        reject(new Error("Timed out connecting to Deepgram"));
        socket.close();
      }, 12_000);

      socket.onopen = () => {
        clearTimeout(timeout);
        this.socket = socket;
        this.keepAlive = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 8000);
        this.options.onOpen?.();
        resolve();
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        if (!this.socket) reject(new Error("Could not connect to Deepgram"));
        else this.options.onError("Live transcription connection dropped");
      };

      socket.onclose = () => {
        if (this.keepAlive) clearInterval(this.keepAlive);
        this.options.onClose?.();
      };

      socket.onmessage = (event) => this.handleMessage(event);
    });
  }

  private handleMessage(event: MessageEvent) {
    let message: DGMessage;
    try {
      message = JSON.parse(event.data as string) as DGMessage;
    } catch {
      return;
    }

    if (message.type === "UtteranceEnd") {
      this.flush();
      return;
    }

    const alternative = message.channel?.alternatives?.[0];
    if (!alternative) return;

    if (!message.is_final) {
      const text = alternative.transcript?.trim();
      if (text) {
        this.options.onInterim(text, alternative.words?.[0]?.speaker ?? 0);
      }
      return;
    }

    const words = alternative.words ?? [];
    if (words.length) this.pending.push(...words);

    if (message.speech_final) this.flush();
  }

  private flush() {
    if (!this.pending.length) return;
    const words = this.pending;
    this.pending = [];

    let run: DGWord[] = [];
    const emit = () => {
      if (!run.length) return;
      const text = run.map((w) => w.punctuated_word ?? w.word).join(" ").trim();
      if (text) {
        this.options.onSentence({
          speakerIndex: run[0].speaker ?? 0,
          text,
          startMs: Math.round(run[0].start * 1000),
          endMs: Math.round(run[run.length - 1].end * 1000),
          words: run.map((w) => ({
            w: w.punctuated_word ?? w.word,
            s: Math.round(w.start * 1000),
            e: Math.round(w.end * 1000),
          })),
        });
      }
      run = [];
    };

    for (const word of words) {
      if (run.length && (run[0].speaker ?? 0) !== (word.speaker ?? 0)) emit();
      run.push(word);
    }
    emit();
    this.options.onInterim("", 0);
  }

  send(chunk: ArrayBuffer) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(chunk);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.flush();
    if (this.keepAlive) clearInterval(this.keepAlive);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
      await new Promise((r) => setTimeout(r, 400));
      this.socket.close();
    }
    this.socket = null;
  }
}
