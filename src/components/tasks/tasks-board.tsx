"use client";

import { CalendarClock, Check, ExternalLink, ListChecks } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar, Badge, Card, Checkbox, EmptyState, Input, SectionLabel } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export type TaskRow = {
  id: string;
  text: string;
  assignee: string | null;
  dueDate: string | null;
  status: "open" | "done";
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
};

export function TasksBoard({ tasks }: { tasks: TaskRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(tasks);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const assignees = useMemo(
    () => [...new Set(rows.map((t) => t.assignee).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((t) => {
      if (filter !== "all" && t.status !== filter) return false;
      if (assignee && t.assignee !== assignee) return false;
      if (q && !t.text.toLowerCase().includes(q) && !t.meetingTitle.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, filter, assignee, query]);

  const byMeeting = useMemo(() => {
    const groups = new Map<string, TaskRow[]>();
    for (const t of visible) {
      groups.set(t.meetingId, [...(groups.get(t.meetingId) ?? []), t]);
    }
    return [...groups.entries()];
  }, [visible]);

  async function toggle(task: TaskRow) {
    const next = task.status === "open" ? "done" : "open";
    setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    router.refresh();
  }

  const openCount = rows.filter((t) => t.status === "open").length;
  const doneCount = rows.length - openCount;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Tasks</h1>
        <p className="mt-1 text-[13.5px] text-ink-500">
          Every commitment extracted from your meetings, with the moment it was made.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {(["open", "done", "all"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full px-3 py-1 text-[12.5px] font-medium capitalize transition",
                filter === key
                  ? "bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-200",
              )}
            >
              {key}
              <span className="ml-1 tabular-nums opacity-70">
                {key === "open" ? openCount : key === "done" ? doneCount : rows.length}
              </span>
            </button>
          ))}

          {assignees.length > 0 && (
            <select
              value={assignee ?? ""}
              onChange={(e) => setAssignee(e.target.value || null)}
              className="h-7 rounded-lg border border-line bg-white px-2 text-[12.5px] outline-none"
            >
              <option value="">Anyone</option>
              {assignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}

          <span className="flex-1" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="w-52"
          />
        </div>

        <div className="mt-5 space-y-5">
          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListChecks}
                title={filter === "done" ? "Nothing completed yet" : "No open tasks"}
                description="Action items are pulled out of each meeting automatically when notes are generated."
              />
            </Card>
          ) : (
            byMeeting.map(([meetingId, items]) => (
              <section key={meetingId}>
                <div className="mb-2 flex items-center gap-2">
                  <SectionLabel className="truncate">{items[0].meetingTitle}</SectionLabel>
                  <span className="text-[11px] text-ink-400">
                    {new Date(items[0].meetingDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <Link
                    href={`/meetings/${meetingId}`}
                    className="text-ink-400 hover:text-brand-600"
                  >
                    <ExternalLink className="size-3" />
                  </Link>
                </div>

                <Card className="divide-y divide-line">
                  {items.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 px-3.5 py-2.5">
                      <Checkbox
                        checked={task.status === "done"}
                        onCheckedChange={() => toggle(task)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[13px] leading-relaxed",
                            task.status === "done"
                              ? "text-ink-400 line-through"
                              : "text-ink-800",
                          )}
                        >
                          {task.text}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {task.assignee && (
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-500">
                              <Avatar name={task.assignee} size={15} />
                              {task.assignee}
                            </span>
                          )}
                          {task.dueDate && (
                            <Badge tone="amber">
                              <CalendarClock />
                              {task.dueDate}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {task.status === "done" && (
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      )}
                    </div>
                  ))}
                </Card>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
