"use client";

import { ArrowUp, Loader2, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/misc";
import { cn, parseTimecode } from "@/lib/utils";
import { usePlayback } from "./playback";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What was decided?",
  "What are the open questions?",
  "Summarize every number mentioned",
  "What did each person commit to?",
];

export function AskFredPanel({
  meetingId,
  hasTranscript,
}: {
  meetingId: string;
  hasTranscript: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    if (!question.trim() || streaming) return;
    const history = turns.slice(-6);
    setTurns((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/meetings/${meetingId}/askfred`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const message = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(message.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: `_${error instanceof Error ? error.message : "Something went wrong"}_`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <Sparkles className="size-3.5 text-brand-600" />
        <h2 className="text-[13px] font-semibold text-ink-900">AskFred</h2>
        <span className="flex-1" />
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setTurns([])}>
            Clear
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-ink-500">
              Ask anything about this meeting. Answers cite the moment they came from — click a
              timestamp to jump there.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={!hasTranscript}
                  onClick={() => ask(s)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-ink-700 transition hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, i) => (
              <div key={i}>
                {turn.role === "user" ? (
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-600 px-3 py-2 text-[13px] leading-relaxed text-white">
                      {turn.content}
                    </p>
                  </div>
                ) : turn.content ? (
                  <AnswerBody text={turn.content} />
                ) : (
                  <div className="flex items-center gap-2 text-[12.5px] text-ink-400">
                    <Loader2 className="size-3.5 animate-spin" />
                    Reading the transcript…
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="relative">
          <Textarea
            rows={2}
            value={input}
            disabled={!hasTranscript}
            placeholder={hasTranscript ? "Ask about this meeting…" : "Waiting for the transcript…"}
            className="pr-11 text-[13px]"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
          />
          <Button
            variant="primary"
            size="icon"
            className="absolute bottom-2 right-2 size-7 rounded-lg"
            disabled={!hasTranscript || (!input.trim() && !streaming)}
            onClick={() => (streaming ? abortRef.current?.abort() : ask(input))}
          >
            {streaming ? <Square className="size-3 fill-current" /> : <ArrowUp className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnswerBody({ text }: { text: string }) {
  const { seek } = usePlayback();

  const renderInline = (raw: string, keyPrefix: string) => {
    const parts = raw.split(/(\[t=\d{1,2}:\d{2}(?::\d{2})?\]|\*\*[^*]+\*\*|_[^_]+_)/g);
    return parts.filter(Boolean).map((part, i) => {
      const stamp = part.match(/^\[t=(\d{1,2}:\d{2}(?::\d{2})?)\]$/);
      if (stamp) {
        const ms = parseTimecode(stamp[1]);
        return (
          <button
            key={`${keyPrefix}-${i}`}
            onClick={() => ms !== null && seek(ms)}
            className="mx-0.5 inline-flex items-center rounded bg-brand-100 px-1 py-px align-baseline font-mono text-[11px] font-medium text-brand-700 transition hover:bg-brand-200"
          >
            {stamp[1]}
          </button>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("_") && part.endsWith("_")) {
        return (
          <em key={`${keyPrefix}-${i}`} className="text-ink-400">
            {part.slice(1, -1)}
          </em>
        );
      }
      return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    });
  };

  const blocks = text.split(/\n/).filter((l) => l.trim().length > 0);

  return (
    <div className="space-y-1.5 text-[13px] leading-[1.7] text-ink-700">
      {blocks.map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={i} className={cn("flex gap-2 pl-1")}>
              <span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-300" />
              <p>{renderInline(bullet[1], String(i))}</p>
            </div>
          );
        }
        return <p key={i}>{renderInline(line, String(i))}</p>;
      })}
    </div>
  );
}
