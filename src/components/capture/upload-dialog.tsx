"use client";

import { upload } from "@vercel/blob/client";
import { FileAudio, Loader2, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const ACCEPT = "audio/*,video/mp4,video/webm,video/quicktime";

function prettySize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDialog({
  open,
  onOpenChange,
  onCreated,
  blobEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (meetingId: string) => void;
  blobEnabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setTitle("");
    setBusy(false);
    setProgress(0);
    setDragging(false);
  }

  function pick(next: File | null | undefined) {
    if (!next) return;
    setFile(next);
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setProgress(5);

    try {
      let audioUrl: string;

      if (blobEnabled) {
        const blob = await upload(`uploads/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/uploads",
          onUploadProgress: ({ percentage }) => setProgress(Math.max(5, percentage * 0.9)),
        });
        audioUrl = blob.url;
      } else {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads/direct", { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
        audioUrl = ((await res.json()) as { url: string }).url;
        setProgress(90);
      }

      const created = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || file.name,
          source: "upload",
          audioUrl,
          mimeType: file.type || "audio/mpeg",
        }),
      });
      if (!created.ok) throw new Error((await created.json()).error ?? "Could not create meeting");
      const { id } = (await created.json()) as { id: string };

      setProgress(100);
      toast.success("Uploaded — transcribing now");
      onCreated(id);
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload audio or video</DialogTitle>
          <DialogDescription>
            Transcribed with speaker diarization, then summarized.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition",
                dragging
                  ? "border-brand-400 bg-brand-50"
                  : "border-ink-300 hover:border-brand-400 hover:bg-ink-50",
              )}
            >
              <UploadCloud className="mb-2 size-6 text-ink-400" />
              <p className="text-[13.5px] font-medium text-ink-800">
                Drop a file here, or click to browse
              </p>
              <p className="mt-1 text-[12px] text-ink-400">
                MP3, WAV, M4A, WebM, MP4, MOV — up to 500 MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-ink-50 px-3 py-2.5">
              <FileAudio className="size-4 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink-900">{file.name}</p>
                <p className="text-[11.5px] text-ink-500">{prettySize(file.size)}</p>
              </div>
              {!busy && (
                <button
                  onClick={() => setFile(null)}
                  className="rounded-md p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}

          {file && (
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
                Meeting title
              </label>
              <Input
                value={title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Customer call"
              />
            </div>
          )}

          {busy && (
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!file || busy} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              {busy ? "Uploading…" : "Upload & transcribe"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
