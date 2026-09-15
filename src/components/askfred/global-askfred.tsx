"use client";

import { ArrowUp, Loader2, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Textarea } from "@/components/ui/misc";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What did I commit to this week?",
  "Summarize every pricing discussion",
  "What objections came up in sales calls?",
  "Which decisions are still open?",
];

export function GlobalAskFred({
  initialQuestion,
  meetingCount,
  provider,
}: {
  initialQuestion: string;
  meetingCount: number;
  provider: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  async function ask(question: string) {
    if (!question.trim() || streaming) return;
    const history = turns.slice(-6);
    setTurns((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/askfred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Request failed");
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
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6">
        <div className="shrink-0 pb-3 pt-7">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand-600" />
            <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">AskFred</h1>
            <Badge tone="neutral">{provider}</Badge>
          </div>
          <p className="mt-1 text-[13.5px] text-ink-500">
            Ask across all {meetingCount} of your meetings. Fred searches transcripts, then answers
            from what was actually said.
          </p>
        </div>

        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-2">
          {turns.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-left">
                  <Card className="px-3.5 py-3 transition hover:border-brand-300">
                    <p className="text-[13px] text-ink-700">{s}</p>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {turns.map((turn, i) => (
                <div key={i}>
                  {turn.role === "user" ? (
                    <div className="flex justify-end">
                      <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-[13.5px] leading-relaxed text-white">
                        {turn.content}
                      </p>
                    </div>
                  ) : turn.content ? (
                    <Answer text={turn.content} />
                  ) : (
                    <div className="flex items-center gap-2 text-[13px] text-ink-400">
                      <Loader2 className="size-3.5 animate-spin" />
                      Searching your meetings…
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 pb-6 pt-2">
          <div className="relative">
            <Textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about anything that was said…"
              className="pr-12 text-[13.5px]"
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
              className="absolute bottom-2 right-2 size-8 rounded-lg"
              disabled={!input.trim() && !streaming}
              onClick={() => (streaming ? abortRef.current?.abort() : ask(input))}
            >
              {streaming ? <Square className="size-3 fill-current" /> : <ArrowUp />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Answer({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="space-y-1.5 text-[13.5px] leading-[1.75] text-ink-700">
      {lines.map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const content = bullet ? bullet[1] : line;
        const parts = content.split(/(\*\*[^*]+\*\*|_[^_]+_|\[t=\d{1,2}:\d{2}(?::\d{2})?\])/g);
        const rendered = parts.filter(Boolean).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**"))
            return <strong key={j} className="font-semibold text-ink-900">{part.slice(2, -2)}</strong>;
          if (part.startsWith("_") && part.endsWith("_"))
            return <em key={j} className="text-ink-400">{part.slice(1, -1)}</em>;
          if (/^\[t=/.test(part))
            return (
              <span key={j} className="mx-0.5 rounded bg-brand-100 px-1 font-mono text-[11px] text-brand-700">
                {part.slice(3, -1)}
              </span>
            );
          return <span key={j}>{part}</span>;
        });
        return bullet ? (
          <div key={i} className="flex gap-2 pl-1">
            <span className="mt-[10px] size-1 shrink-0 rounded-full bg-ink-300" />
            <p>{rendered}</p>
          </div>
        ) : (
          <p key={i}>{rendered}</p>
        );
      })}
    </div>
  );
}
