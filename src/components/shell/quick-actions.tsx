"use client";

import { Mic, Upload, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddToLiveDialog } from "@/components/capture/add-to-live-dialog";
import { RecordDialog } from "@/components/capture/record-dialog";
import { UploadDialog } from "@/components/capture/upload-dialog";
import { Card } from "@/components/ui/misc";

const ACTIONS = [
  {
    key: "record" as const,
    icon: Mic,
    title: "Record now",
    body: "Capture this browser tab's audio plus your mic",
  },
  {
    key: "upload" as const,
    icon: Upload,
    title: "Upload a file",
    body: "Transcribe an existing recording with speaker labels",
  },
  {
    key: "live" as const,
    icon: Video,
    title: "Add to live meeting",
    body: "Send the notetaker to a call (simulated)",
  },
];

export function QuickActions({
  liveEnabled,
  blobEnabled,
}: {
  liveEnabled: boolean;
  blobEnabled: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"record" | "upload" | "live" | null>(null);
  const go = (id: string) => router.push(`/meetings/${id}`);

  return (
    <>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {ACTIONS.map(({ key, icon: Icon, title, body }) => (
          <button key={key} onClick={() => setDialog(key)} className="text-left">
            <Card className="h-full px-3.5 py-3 transition hover:border-brand-300 hover:shadow-sm">
              <span className="mb-2 flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="size-4" />
              </span>
              <p className="text-[13.5px] font-semibold text-ink-900">{title}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{body}</p>
            </Card>
          </button>
        ))}
      </div>

      <RecordDialog
        open={dialog === "record"}
        liveEnabled={liveEnabled}
        onOpenChange={(v: boolean) => setDialog(v ? "record" : null)}
        onCreated={go}
      />
      <UploadDialog
        open={dialog === "upload"}
        blobEnabled={blobEnabled}
        onOpenChange={(v: boolean) => setDialog(v ? "upload" : null)}
        onCreated={go}
      />
      <AddToLiveDialog
        open={dialog === "live"}
        onOpenChange={(v: boolean) => setDialog(v ? "live" : null)}
        onCreated={go}
      />
    </>
  );
}
