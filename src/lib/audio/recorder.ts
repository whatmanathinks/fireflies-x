export type CaptureMode = "mic" | "mic+tab";

export type RecorderHandles = {
  stream: MediaStream;
  audioContext: AudioContext;
  mediaRecorder: MediaRecorder;
  sampleRate: number;
  stop: () => Promise<Blob>;
  tabStream: MediaStream | null;
  micStream: MediaStream;
};

const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    const out = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

export async function startCapture(
  mode: CaptureMode,
  onPcm: (chunk: ArrayBuffer) => void,
): Promise<RecorderHandles> {
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  let tabStream: MediaStream | null = null;
  if (mode === "mic+tab") {
    tabStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (tabStream.getAudioTracks().length === 0) {
      tabStream.getTracks().forEach((t) => t.stop());
      micStream.getTracks().forEach((t) => t.stop());
      throw new Error(
        'No tab audio was shared. Re-run and tick "Also share tab audio" in the picker.',
      );
    }
    tabStream.getVideoTracks().forEach((t) => t.stop());
  }

  const audioContext = new AudioContext();
  await audioContext.resume();

  const destination = audioContext.createMediaStreamDestination();
  const mixBus = audioContext.createGain();
  mixBus.gain.value = 1;

  const micGain = audioContext.createGain();
  micGain.gain.value = 1;
  audioContext.createMediaStreamSource(micStream).connect(micGain);
  micGain.connect(mixBus);

  if (tabStream && tabStream.getAudioTracks().length) {
    const tabGain = audioContext.createGain();
    tabGain.gain.value = 1;
    audioContext.createMediaStreamSource(tabStream).connect(tabGain);
    tabGain.connect(mixBus);
  }

  mixBus.connect(destination);

  const blobUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
  );
  await audioContext.audioWorklet.addModule(blobUrl);
  URL.revokeObjectURL(blobUrl);

  const tap = new AudioWorkletNode(audioContext, "pcm-tap");
  tap.port.onmessage = (event) => onPcm(event.data as ArrayBuffer);
  mixBus.connect(tap);

  const silentSink = audioContext.createGain();
  silentSink.gain.value = 0;
  tap.connect(silentSink);
  silentSink.connect(audioContext.destination);

  const mimeType = pickMimeType();
  const mediaRecorder = new MediaRecorder(
    destination.stream,
    mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined,
  );

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.start(2000);

  const stop = () =>
    new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        micStream.getTracks().forEach((t) => t.stop());
        tabStream?.getTracks().forEach((t) => t.stop());
        tap.port.onmessage = null;
        tap.disconnect();
        void audioContext.close();
        resolve(blob);
      };
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
      else mediaRecorder.onstop?.(new Event("stop"));
    });

  return {
    stream: destination.stream,
    audioContext,
    mediaRecorder,
    sampleRate: audioContext.sampleRate,
    stop,
    tabStream,
    micStream,
  };
}

export function computeLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i] - 128));
  }
  return Math.min(1, peak / 90);
}
