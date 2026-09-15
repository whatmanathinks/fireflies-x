import { TasksBoard } from "@/components/tasks/tasks-board";
import { requireSession } from "@/lib/auth";
import { listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await requireSession();
  const tasks = await listTasks(session.workspaceId);

  return (
    <TasksBoard
      tasks={tasks.map((t) => ({
        id: t.id,
        text: t.text,
        assignee: t.assignee,
        dueDate: t.dueDate,
        status: t.status,
        meetingId: t.meetingId,
        meetingTitle: t.meetingTitle,
        meetingDate: t.meetingDate.toISOString(),
      }))}
    />
  );
}
