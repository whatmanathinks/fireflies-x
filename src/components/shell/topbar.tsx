"use client";

import {
  ChevronDown,
  LogOut,
  Mic,
  Plus,
  Search,
  Settings,
  Upload,
  Video,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddToLiveDialog } from "@/components/capture/add-to-live-dialog";
import { RecordDialog } from "@/components/capture/record-dialog";
import { UploadDialog } from "@/components/capture/upload-dialog";
import { Button } from "@/components/ui/button";
import { Avatar, Badge } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";

export type SessionUser = {
  name: string;
  email: string;
  image: string | null;
  workspaceName: string;
};

export function Topbar({
  user,
  demoMode,
  liveEnabled,
  blobEnabled,
  realNotetaker,
  onOpenSearch,
}: {
  user: SessionUser;
  demoMode: boolean;
  liveEnabled: boolean;
  blobEnabled: boolean;
  realNotetaker: boolean;
  onOpenSearch: () => void;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"record" | "upload" | "live" | null>(null);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-4">
      <button
        onClick={onOpenSearch}
        className="flex h-8.5 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-left text-[13px] text-ink-400 transition hover:border-ink-300 hover:bg-white"
      >
        <Search className="size-3.5" />
        <span className="flex-1">Search meetings, moments, people…</span>
        <kbd className="rounded border border-line bg-white px-1.5 py-px font-sans text-[11px] text-ink-400">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {demoMode && (
        <Badge tone="amber" title="No DEEPGRAM_API_KEY / ANTHROPIC_API_KEY set — transcription and notes are scripted.">
          Demo mode
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="primary" size="md">
            <Plus />
            Capture
            <ChevronDown className="opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => setDialog("record")}>
            <Mic />
            <div>
              <div>Record now</div>
              <div className="text-[11.5px] text-ink-400">Mic + browser tab audio</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("upload")}>
            <Upload />
            <div>
              <div>Upload audio or video</div>
              <div className="text-[11.5px] text-ink-400">Diarized transcription</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("live")}>
            <Video />
            <div>
              <div>Add to live meeting</div>
              <div className="text-[11.5px] text-ink-400">
                {realNotetaker ? "Bot joins Meet, Zoom or Teams" : "Notetaker bot (simulated)"}
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-lg p-0.5 pr-1.5 hover:bg-ink-100">
            <Avatar name={user.name} image={user.image} size={26} />
            <ChevronDown className="size-3.5 text-ink-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="px-2 py-1.5">
            <p className="truncate text-[13px] font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-[12px] text-ink-500">{user.email}</p>
            <p className="mt-1 truncate text-[11.5px] text-ink-400">{user.workspaceName}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RecordDialog
        open={dialog === "record"}
        liveEnabled={liveEnabled}
        onOpenChange={(v: boolean) => setDialog(v ? "record" : null)}
        onCreated={(id: string) => router.push(`/meetings/${id}`)}
      />
      <UploadDialog
        open={dialog === "upload"}
        blobEnabled={blobEnabled}
        onOpenChange={(v: boolean) => setDialog(v ? "upload" : null)}
        onCreated={(id: string) => router.push(`/meetings/${id}`)}
      />
      <AddToLiveDialog
        open={dialog === "live"}
        onOpenChange={(v: boolean) => setDialog(v ? "live" : null)}
        onCreated={(id: string) => router.push(`/meetings/${id}`)}
      />
    </header>
  );
}
