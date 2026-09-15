"use client";

import { FileText, ListChecks, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Avatar, Badge, Card, SectionLabel } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import type { ActionItem, Chapter } from "@/db/schema";
import { cn, formatTimecode } from "@/lib/utils";

type Summary = {
  gist: string;
  shortSummary: string;
  overview: string;
  keywords: string[];
  bulletGist: string[];
  outline: Chapter[];
  actionItems: ActionItem[];
} | null;

type Line = {
  id: string;
  index: number;
  speakerName: string;
  speakerIndex: number;
  text: string;
  startMs: number;
};

export function SharedMeeting({
  summary,
  sentences,
  audioUrl,
}: {
  summary: Summary;
  sentences: Line[];
  audioUrl: string | null;
}) {
  const [seekTo, setSeekTo] = useState<number | null>(null);

  const blocks: { speakerName: string; startMs: number; items: Line[] }[] = [];
  for (const line of sentences) {
    const last = blocks[blocks.length - 1];
    if (last && last.speakerName === line.speakerName) last.items.push(line);
    else blocks.push({ speakerName: line.speakerName, startMs: line.startMs, items: [line] });
  }

  return (
    <div className="mt-6">
      {audioUrl && (
        <Card className="mb-5 p-3">
          <audio
            controls
            className="w-full"
            src={audioUrl}
            onTimeUpdate={undefined}
            ref={(el) => {
              if (el && seekTo !== null) {
                el.currentTime = seekTo / 1000;
                void el.play();
                setSeekTo(null);
              }
            }}
          />
        </Card>
      )}

      <Tabs defaultValue="notes">
        <TabsList className="mb-4">
          <TabsTrigger value="notes">
            <FileText className="size-3.5" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="transcript">
            <MessageSquareText className="size-3.5" />
            Transcript
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes">
          {!summary ? (
            <Card className="px-4 py-8 text-center text-[13px] text-ink-400">
              Notes have not been generated for this meeting.
            </Card>
          ) : (
            <div className="space-y-6">
              {summary.gist && (
                <p className="rounded-lg bg-brand-50 px-4 py-3 text-[14px] font-medium leading-relaxed text-brand-900">
                  {summary.gist}
                </p>
              )}

              {summary.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {summary.keywords.map((k) => (
                    <Badge key={k} tone="outline" className="px-2 py-1">
                      {k}
                    </Badge>
                  ))}
                </div>
              )}

              {summary.bulletGist.length > 0 && (
                <section>
                  <SectionLabel className="mb-2">Key takeaways</SectionLabel>
                  <ul className="space-y-1.5">
                    {summary.bulletGist.map((b, i) => (
                      <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink-800">
                        <span className="mt-[9px] size-1 shrink-0 rounded-full bg-brand-500" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {summary.overview && (
                <section>
                  <SectionLabel className="mb-2">Overview</SectionLabel>
                  <div className="space-y-3">
                    {summary.overview.split(/\n{2,}/).map((p, i) => (
                      <p key={i} className="text-[14px] leading-[1.75] text-ink-700">
                        {p}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {summary.outline.length > 0 && (
                <section>
                  <SectionLabel className="mb-2">Outline</SectionLabel>
                  <ol className="space-y-3">
                    {summary.outline.map((chapter, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-12 shrink-0 font-mono text-[11.5px] text-ink-400">
                          {formatTimecode(chapter.startMs)}
                        </span>
                        <div>
                          <p className="text-[13.5px] font-semibold text-ink-900">
                            {chapter.title}
                          </p>
                          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
                            {chapter.summary}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {summary.actionItems.length > 0 && (
                <section>
                  <SectionLabel className="mb-2">Action items</SectionLabel>
                  <Card className="divide-y divide-line">
                    {summary.actionItems.map((item, i) => (
                      <div key={i} className="flex gap-2.5 px-3.5 py-2.5">
                        <ListChecks className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
                        <div>
                          <p className="text-[13.5px] leading-relaxed text-ink-800">{item.text}</p>
                          {(item.assignee || item.dueDate) && (
                            <div className="mt-1 flex gap-1.5">
                              {item.assignee && <Badge tone="brand">{item.assignee}</Badge>}
                              {item.dueDate && <Badge tone="amber">{item.dueDate}</Badge>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </Card>
                </section>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="transcript">
          <div className="space-y-5">
            {blocks.map((block, i) => (
              <div key={i}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar name={block.speakerName} size={24} />
                  <span className="text-[13px] font-semibold text-ink-900">
                    {block.speakerName}
                  </span>
                  <button
                    onClick={() => setSeekTo(block.startMs)}
                    className={cn(
                      "font-mono text-[11.5px] text-ink-400",
                      audioUrl && "hover:text-brand-600",
                    )}
                  >
                    {formatTimecode(block.startMs)}
                  </button>
                </div>
                <div className="ml-8 space-y-0.5">
                  {block.items.map((line) => (
                    <p key={line.id} className="text-[14px] leading-[1.7] text-ink-700">
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
