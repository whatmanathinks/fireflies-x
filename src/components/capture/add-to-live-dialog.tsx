"use client";

import { Bot, Info, Loader2, Video } from "lucide-react";
import { useState } from "react";
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

export function AddToLiveDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (meetingId: string) => void;
}) {
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = /^https?:\/\/.+/.test(link.trim());

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Live meeting",
          source: "bot_sim",
          meetingLink: link.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not dispatch notetaker");
      const { id } = (await res.json()) as { id: string };
      toast.success("Notetaker dispatched");
      onCreated(id);
      onOpenChange(false);
      setLink("");
      setTitle("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not dispatch notetaker");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-4 text-brand-600" />
            Add notetaker to a live meeting
          </DialogTitle>
          <DialogDescription>
            Sends the notetaker bot to a Google Meet, Zoom or Teams call.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <Info className="mt-px size-4 shrink-0 text-amber-600" />
            <div className="text-[12px] leading-relaxed text-amber-900">
              <b>This path is simulated.</b> A real notetaker bot needs headless browsers that
              join and negotiate WebRTC with each platform — out of scope here. The bot state
              machine, timings and downstream pipeline are real; the audio is a sample recording.
              <br />
              <span className="mt-1 inline-block">
                For genuine capture of a real call, use <b>Record now</b> and share the call tab.
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
              Meeting link
            </label>
            <Input
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
              Meeting title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Customer onboarding call"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!valid || busy} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : <Video />}
              {busy ? "Dispatching…" : "Send notetaker"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
