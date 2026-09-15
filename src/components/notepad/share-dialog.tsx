"use client";

import { Check, Copy, Globe, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/primitives";

const EXPIRY = [
  { label: "Never", days: 0 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

export function ShareDialog({
  meetingId,
  open,
  onOpenChange,
}: {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState(0);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await fetch(`/api/meetings/${meetingId}/share`);
      if (!res.ok) return;
      const data = (await res.json()) as { token: string | null; expiresAt: string | null };
      setLink(data.token ? `${window.location.origin}/share/${data.token}` : null);
      setExpiresAt(data.expiresAt);
    })();
  }, [open, meetingId]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: days || null }),
      });
      if (!res.ok) throw new Error("Could not create link");
      const data = (await res.json()) as { token: string; expiresAt: string | null };
      setLink(`${window.location.origin}/share/${data.token}`);
      setExpiresAt(data.expiresAt);
      toast.success("Public link created");
    } catch {
      toast.error("Could not create link");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    await fetch(`/api/meetings/${meetingId}/share`, { method: "DELETE" });
    setLink(null);
    setExpiresAt(null);
    setBusy(false);
    toast.success("Link revoked");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this meeting</DialogTitle>
          <DialogDescription>
            Anyone with the link can read the summary and transcript — no account needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          {link ? (
            <>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                  className="h-8.5 w-full rounded-lg border border-line bg-ink-50 px-2.5 font-mono text-[12px] text-ink-700 outline-none"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                >
                  {copied ? <Check className="text-emerald-600" /> : <Copy />}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-ink-500">
                  {expiresAt
                    ? `Expires ${new Date(expiresAt).toLocaleDateString()}`
                    : "Never expires"}
                </p>
                <Button variant="danger" size="sm" disabled={busy} onClick={revoke}>
                  <Trash2 />
                  Revoke
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
                  Link expires after
                </label>
                <div className="flex gap-1.5">
                  {EXPIRY.map((e) => (
                    <button
                      key={e.days}
                      onClick={() => setDays(e.days)}
                      className={
                        days === e.days
                          ? "rounded-lg bg-brand-600 px-3 py-1.5 text-[12.5px] font-medium text-white"
                          : "rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50"
                      }
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" className="w-full" disabled={busy} onClick={create}>
                {busy ? <Loader2 className="animate-spin" /> : <Globe />}
                Create public link
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
