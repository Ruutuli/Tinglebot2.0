"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";

// ============================================================================
// Types
// ============================================================================

type Column = "repeating" | "todo" | "in_progress" | "pending" | "done";
type Priority = "low" | "medium" | "high" | "urgent";
type Frequency = "daily" | "weekly" | "monthly" | "quarterly";

interface Assignee {
  discordId: string;
  username: string;
  avatar: string | null;
}

interface ChecklistItem {
  _id: string;
  text: string;
  checked: boolean;
  createdAt: string;
}

interface Comment {
  _id: string;
  text: string;
  author: {
    discordId: string;
    username: string;
    avatar: string | null;
  };
  createdAt: string;
  editedAt: string | null;
}

interface Task {
  _id: string;
  title: string;
  description: string;
  column: Column;
  priority: Priority;
  dueDate: string | null;
  assignees: Assignee[];
  createdBy: { discordId: string; username: string };
  isRepeating: boolean;
  repeatConfig: {
    frequency: Frequency;
    lastCompleted: string | null;
    nextDue: string | null;
  } | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  discordSource?: {
    messageId: string | null;
    channelId: string | null;
    guildId: string | null;
    messageUrl: string | null;
  };
  checklist?: ChecklistItem[];
  comments?: Comment[];
}

interface ModInfo {
  discordId: string;
  username: string;
  avatar: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const COLUMNS: { id: Column; label: string; icon: string }[] = [
  { id: "repeating", label: "Repeating", icon: "fa-repeat" },
  { id: "todo", label: "To Do", icon: "fa-list-check" },
  { id: "in_progress", label: "In Progress", icon: "fa-spinner" },
  { id: "pending", label: "Pending", icon: "fa-hourglass-half" },
  { id: "done", label: "Done", icon: "fa-circle-check" },
];

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bgColor: string }> = {
  low: { label: "Low", color: "text-gray-400", bgColor: "bg-gray-600/30" },
  medium: { label: "Medium", color: "text-blue-400", bgColor: "bg-blue-600/30" },
  high: { label: "High", color: "text-orange-400", bgColor: "bg-orange-600/30" },
  urgent: { label: "Urgent", color: "text-red-400", bgColor: "bg-red-600/30" },
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

// ============================================================================
// Utility Functions
// ============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function isDueSoon(dateStr: string | null, hours = 24): boolean {
  if (!dateStr) return false;
  const dueDate = new Date(dateStr);
  const threshold = new Date();
  threshold.setHours(threshold.getHours() + hours);
  return dueDate <= threshold && dueDate > new Date();
}

// ============================================================================
// Task Card Component
// ============================================================================

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
}

function TaskCard({ task, onClick, isDragging }: TaskCardProps) {
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const overdue = task.column !== "done" && isOverdue(task.dueDate);
  const dueSoon = task.column !== "done" && !overdue && isDueSoon(task.dueDate);
  
  const checklistTotal = task.checklist?.length ?? 0;
  const checklistDone = task.checklist?.filter((c) => c.checked).length ?? 0;
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className={`
        group cursor-pointer rounded-lg border-2 p-3 transition-all
        ${isDragging ? "opacity-50" : "opacity-100"}
        border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]
        hover:border-[var(--totk-light-ocher)] hover:shadow-lg
      `}
    >
      {/* Priority Badge, Discord Link & Repeating Icon */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${priorityConfig.bgColor} ${priorityConfig.color}`}>
            {priorityConfig.label}
          </span>
          {task.discordSource?.messageUrl && (
            <a
              href={task.discordSource.messageUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[var(--botw-blue)] hover:text-[var(--botw-dark-blue)]"
              title="View source message"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
          )}
        </div>
        {task.isRepeating && (
          <span className="text-[var(--totk-light-green)]" title="Repeating task">
            <i className="fa-solid fa-repeat text-xs" />
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mb-1 font-medium text-[var(--totk-light-ocher)] line-clamp-2">
        {task.title}
      </h3>

      {/* Description Preview */}
      {task.description && (
        <p className="mb-2 text-xs text-[var(--botw-pale)] opacity-70 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Checklist Progress */}
      {checklistTotal > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--botw-pale)]">
            <span>
              <i className="fa-solid fa-square-check mr-1" />
              {checklistDone}/{checklistTotal}
            </span>
            <span>{checklistPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--totk-dark-ocher)]">
            <div
              className={`h-full transition-all ${checklistPercent === 100 ? "bg-green-500" : "bg-[var(--totk-light-green)]"}`}
              style={{ width: `${checklistPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer: Due Date, Comments & Assignees */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {task.dueDate && (
            <span
              className={`text-xs ${
                overdue
                  ? "font-medium text-red-400"
                  : dueSoon
                    ? "font-medium text-orange-400"
                    : "text-[var(--botw-pale)] opacity-70"
              }`}
            >
              <i className="fa-solid fa-calendar-day mr-1" />
              {formatDate(task.dueDate)}
              {overdue && " (Overdue)"}
            </span>
          )}
          {(task.comments?.length ?? 0) > 0 && (
            <span className="text-xs text-[var(--botw-pale)] opacity-70">
              <i className="fa-solid fa-comment mr-1" />
              {task.comments?.length}
            </span>
          )}
        </div>

        {/* Assignee Avatars */}
        {task.assignees.length > 0 && (
          <div className="flex -space-x-2">
            {task.assignees.slice(0, 3).map((assignee) => (
              <div
                key={assignee.discordId}
                className="h-6 w-6 overflow-hidden rounded-full border-2 border-[var(--botw-warm-black)] bg-[var(--totk-dark-ocher)]"
                title={assignee.username}
              >
                {assignee.avatar ? (
                  <img src={assignee.avatar} alt={assignee.username} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[var(--botw-pale)]">
                    {assignee.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
            {task.assignees.length > 3 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--botw-warm-black)] bg-[var(--totk-dark-ocher)] text-xs text-[var(--botw-pale)]">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sortable Task Card Wrapper
// ============================================================================

interface SortableTaskCardProps {
  task: Task;
  onClick: () => void;
}

function SortableTaskCard({ task, onClick }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

// ============================================================================
// Column Component
// ============================================================================

interface ColumnProps {
  column: { id: Column; label: string; icon: string };
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (column: Column) => void;
}

function KanbanColumn({ column, tasks, onTaskClick, onAddTask }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div className={`flex max-h-[calc(100vh-12rem)] min-w-[200px] flex-1 flex-col rounded-xl border-2 bg-[var(--botw-black)]/50 transition-colors ${
      isOver ? "border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10" : "border-[var(--totk-dark-ocher)]"
    }`}>
      {/* Column Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b-2 border-[var(--totk-dark-ocher)] px-4 py-3">
        <div className="flex items-center gap-2">
          <i className={`fa-solid ${column.icon} text-[var(--totk-light-green)]`} />
          <h2 className="font-semibold text-[var(--totk-light-ocher)]">{column.label}</h2>
          <span className="rounded-full bg-[var(--totk-dark-ocher)] px-2 py-0.5 text-xs text-[var(--botw-pale)]">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(column.id)}
          className="rounded p-1 text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-ocher)] hover:text-[var(--totk-light-green)]"
          title="Add task"
        >
          <i className="fa-solid fa-plus" />
        </button>
      </div>

      {/* Task List */}
      <div ref={setNodeRef} className="flex-1 space-y-2 overflow-y-auto p-3" style={{ minHeight: "100px" }}>
        <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task._id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--botw-pale)] opacity-50">
            No tasks
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Table View Component
// ============================================================================

interface TableViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const COLUMN_LABELS: Record<Column, string> = {
  repeating: "Repeating",
  todo: "To Do",
  in_progress: "In Progress",
  pending: "Pending",
  done: "Done",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/20 text-blue-300 border-blue-500/50",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/50",
  urgent: "bg-red-500/20 text-red-300 border-red-500/50",
};

function TableView({ tasks, onTaskClick }: TableViewProps) {
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Sort by column order, then by task order
      const colOrder = COLUMNS.findIndex((c) => c.id === a.column) - COLUMNS.findIndex((c) => c.id === b.column);
      if (colOrder !== 0) return colOrder;
      return a.order - b.order;
    });
  }, [tasks]);

  const getAssigneeNames = (assignees: Assignee[]) => {
    if (!assignees || assignees.length === 0) return "—";
    return assignees.map((a) => a.username).join(", ");
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate || task.column === "done") return false;
    return new Date(task.dueDate) < new Date();
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-black)]/50 p-8 text-center text-[var(--botw-pale)]">
        <i className="fa-solid fa-clipboard-list mb-2 text-3xl opacity-50" />
        <p>No tasks found</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-black)]/50">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-black)]/80 text-[var(--totk-light-ocher)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Assigned To</th>
              <th className="px-4 py-3 font-semibold">Due Date</th>
              <th className="px-4 py-3 font-semibold">Checklist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--totk-dark-ocher)]/50">
            {sortedTasks.map((task) => (
              <tr
                key={task._id}
                onClick={() => onTaskClick(task)}
                className="cursor-pointer transition-colors hover:bg-[var(--totk-dark-ocher)]/30"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {task.discordSource?.messageUrl && (
                      <svg className="h-4 w-4 flex-shrink-0 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                    )}
                    <span className="font-medium text-[var(--botw-pale)]">{task.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--totk-dark-ocher)]/50 px-2.5 py-1 text-xs text-[var(--botw-pale)]">
                    <i className={`fa-solid ${COLUMNS.find((c) => c.id === task.column)?.icon || "fa-circle"} text-[var(--totk-light-green)]`} />
                    {COLUMN_LABELS[task.column]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded border px-2 py-0.5 text-xs capitalize ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
                    {task.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--botw-pale)]">
                  {getAssigneeNames(task.assignees)}
                </td>
                <td className={`px-4 py-3 ${isOverdue(task) ? "text-red-400" : "text-[var(--botw-pale)]"}`}>
                  {isOverdue(task) && <i className="fa-solid fa-exclamation-triangle mr-1" />}
                  {formatDate(task.dueDate)}
                </td>
                <td className="px-4 py-3 text-[var(--botw-pale)]">
                  {task.checklist && task.checklist.length > 0 ? (
                    <span className="text-xs">
                      {task.checklist.filter((i) => i.checked).length}/{task.checklist.length}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Markdown Rendering Helper
// ============================================================================

function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return text;
  
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  
  while (remaining.length > 0) {
    // Links [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/);
    if (linkMatch) {
      if (linkMatch[1]) parts.push(renderInlineMarkdown(linkMatch[1]));
      parts.push(
        <a key={key++} href={linkMatch[3]} target="_blank" rel="noopener noreferrer" 
           className="text-[var(--totk-light-green)] underline hover:text-[var(--botw-pale)]">
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4];
      continue;
    }
    
    // Bold **text**
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(boldMatch[1]);
      parts.push(<strong key={key++} className="font-semibold text-[var(--totk-light-ocher)]">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }
    
    // Bold __text__
    const boldMatch2 = remaining.match(/^(.*?)__([^_]+)__(.*)$/);
    if (boldMatch2) {
      if (boldMatch2[1]) parts.push(boldMatch2[1]);
      parts.push(<strong key={key++} className="font-semibold text-[var(--totk-light-ocher)]">{boldMatch2[2]}</strong>);
      remaining = boldMatch2[3];
      continue;
    }
    
    // Italic *text*
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*(.*)$/);
    if (italicMatch && !italicMatch[1].endsWith('*') && !italicMatch[3].startsWith('*')) {
      if (italicMatch[1]) parts.push(italicMatch[1]);
      parts.push(<em key={key++} className="italic">{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }
    
    // Italic _text_
    const italicMatch2 = remaining.match(/^(.*?)_([^_]+)_(.*)$/);
    if (italicMatch2 && !italicMatch2[1].endsWith('_') && !italicMatch2[3].startsWith('_')) {
      if (italicMatch2[1]) parts.push(italicMatch2[1]);
      parts.push(<em key={key++} className="italic">{italicMatch2[2]}</em>);
      remaining = italicMatch2[3];
      continue;
    }
    
    // Strikethrough ~~text~~
    const strikeMatch = remaining.match(/^(.*?)~~([^~]+)~~(.*)$/);
    if (strikeMatch) {
      if (strikeMatch[1]) parts.push(strikeMatch[1]);
      parts.push(<span key={key++} className="line-through opacity-60">{strikeMatch[2]}</span>);
      remaining = strikeMatch[3];
      continue;
    }
    
    // Inline code `code`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(codeMatch[1]);
      parts.push(
        <code key={key++} className="rounded bg-[var(--totk-dark-ocher)]/50 px-1.5 py-0.5 font-mono text-xs text-[var(--totk-light-green)]">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }
    
    // No more matches, add remaining text
    parts.push(remaining);
    break;
  }
  
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ============================================================================
// Task Modal Component (Trello-style)
// ============================================================================

interface TaskModalProps {
  task: Task | null;
  isNew: boolean;
  defaultColumn?: Column;
  mods: ModInfo[];
  currentUser: { id: string; username: string; avatar?: string } | null;
  onClose: () => void;
  onSave: (data: Partial<Task>) => void;
  onDelete?: () => void;
}

function TaskModal({ task, isNew, defaultColumn, mods, currentUser, onClose, onSave, onDelete }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [editingDescription, setEditingDescription] = useState(isNew);
  const [column, setColumn] = useState<Column>(task?.column ?? defaultColumn ?? "todo");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(() => {
    if (!task?.dueDate) return "";
    const d = new Date(task.dueDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [assignees, setAssignees] = useState<Assignee[]>(task?.assignees ?? []);
  const [isRepeating, setIsRepeating] = useState(task?.isRepeating ?? false);
  const [frequency, setFrequency] = useState<Frequency>(task?.repeatConfig?.frequency ?? "weekly");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist ?? []);
  const [comments, setComments] = useState<Comment[]>(task?.comments ?? []);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hideCheckedItems, setHideCheckedItems] = useState(false);

  const checklistTotal = checklist.length;
  const checklistDone = checklist.filter((c) => c.checked).length;
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        column,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assignees,
        isRepeating,
        repeatConfig: isRepeating ? { frequency } : null,
        checklist,
        comments,
      } as Partial<Task>);
    } finally {
      setSaving(false);
    }
  };

  const toggleAssignee = (mod: ModInfo) => {
    const exists = assignees.find((a) => a.discordId === mod.discordId);
    if (exists) {
      setAssignees(assignees.filter((a) => a.discordId !== mod.discordId));
    } else {
      setAssignees([...assignees, mod]);
    }
  };

  const toggleChecklistItem = (itemId: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item._id === itemId ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      _id: `temp-${Date.now()}`,
      text: newChecklistItem.trim(),
      checked: false,
      createdAt: new Date().toISOString(),
    };
    setChecklist([...checklist, newItem]);
    setNewChecklistItem("");
  };

  const removeChecklistItem = (itemId: string) => {
    setChecklist((prev) => prev.filter((item) => item._id !== itemId));
  };

  const addComment = () => {
    if (!newComment.trim() || !currentUser) return;
    const comment: Comment = {
      _id: `temp-${Date.now()}`,
      text: newComment.trim(),
      author: {
        discordId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar ?? null,
      },
      createdAt: new Date().toISOString(),
      editedAt: null,
    };
    setComments([...comments, comment]);
    setNewComment("");
  };

  const deleteComment = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c._id !== commentId));
  };

  const displayedChecklist = hideCheckedItems
    ? checklist.filter((c) => !c.checked)
    : checklist;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 pt-16" onClick={onClose}>
      <div className="flex min-h-full items-start justify-center px-4 pb-8 pt-4">
        <div
          className="max-h-[calc(100vh-6rem)] w-full max-w-5xl overflow-y-auto rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[var(--totk-dark-ocher)] px-6 py-4">
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent text-xl font-bold text-[var(--totk-light-ocher)] focus:outline-none"
              placeholder="Task title..."
              maxLength={200}
            />
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--botw-pale)]">
              <span>in list <strong>{COLUMNS.find((c) => c.id === column)?.label}</strong></span>
              {task?.discordSource?.messageUrl && (
                <a
                  href={task.discordSource.messageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[var(--botw-blue)] hover:underline"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  View source
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ml-4 text-[var(--botw-pale)] hover:text-[var(--totk-light-ocher)]">
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6 lg:flex-row">
          {/* Main Content */}
          <div className="flex-1 space-y-6">
            {/* Description */}
            <div className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[#1a1615]/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--totk-light-ocher)]">
                  <i className="fa-solid fa-align-left" /> Description
                </h4>
                {!editingDescription && !isNew && description && (
                  <button
                    onClick={() => setEditingDescription(true)}
                    className="rounded bg-[var(--totk-dark-ocher)]/50 px-3 py-1 text-xs font-medium text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]"
                  >
                    <i className="fa-solid fa-pen mr-1" />
                    Edit
                  </button>
                )}
              </div>
              {editingDescription ? (
                <div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#0d0c0b] px-4 py-3 text-sm leading-relaxed text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none"
                    placeholder="Add a more detailed description..."
                    rows={6}
                    maxLength={2000}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setEditingDescription(false)}
                      className="rounded-lg bg-[var(--totk-light-green)] px-4 py-1.5 text-xs font-medium text-[var(--totk-brown)]"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setDescription(task?.description ?? "");
                        setEditingDescription(false);
                      }}
                      className="rounded-lg px-4 py-1.5 text-xs text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setEditingDescription(true)}
                  className="cursor-pointer rounded-lg bg-[#0d0c0b] p-4 transition-colors hover:bg-[var(--totk-dark-ocher)]/20"
                >
                  {description ? (
                    <div className="prose-sm text-sm leading-relaxed text-[var(--botw-pale)]">
                      {description.split('\n').map((line, i) => {
                        // Empty line = paragraph break
                        if (line.trim() === '') {
                          return <br key={i} />;
                        }
                        
                        // Headers (# ## ###)
                        const h1Match = line.match(/^#\s+(.+)$/);
                        if (h1Match) {
                          return <h3 key={i} className="mt-3 mb-1 text-base font-bold text-[var(--totk-light-ocher)]">{h1Match[1]}</h3>;
                        }
                        const h2Match = line.match(/^##\s+(.+)$/);
                        if (h2Match) {
                          return <h4 key={i} className="mt-2 mb-1 text-sm font-bold text-[var(--totk-light-ocher)]">{h2Match[1]}</h4>;
                        }
                        const h3Match = line.match(/^###\s+(.+)$/);
                        if (h3Match) {
                          return <h5 key={i} className="mt-2 mb-1 text-sm font-semibold text-[var(--totk-light-ocher)]">{h3Match[1]}</h5>;
                        }
                        
                        // Full bold line
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <p key={i} className="font-semibold text-[var(--totk-light-ocher)]">{line.slice(2, -2)}</p>;
                        }
                        
                        // Bullet list (- or *)
                        const bulletMatch = line.match(/^[\-\*]\s+(.+)$/);
                        if (bulletMatch) {
                          return <p key={i} className="ml-4 before:content-['•'] before:mr-2 before:text-[var(--totk-light-green)]">{renderInlineMarkdown(bulletMatch[1])}</p>;
                        }
                        
                        // Numbered list
                        const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
                        if (numMatch) {
                          return <p key={i} className="ml-4"><span className="mr-2 text-[var(--totk-light-green)]">{numMatch[1]}.</span>{renderInlineMarkdown(numMatch[2])}</p>;
                        }
                        
                        // Checkbox unchecked [ ]
                        const uncheckedMatch = line.match(/^\[[\s]\]\s+(.+)$/);
                        if (uncheckedMatch) {
                          return <p key={i} className="ml-4 flex items-center gap-2"><span className="text-[var(--botw-pale)] opacity-50">☐</span>{renderInlineMarkdown(uncheckedMatch[1])}</p>;
                        }
                        
                        // Checkbox checked [x]
                        const checkedMatch = line.match(/^\[[xX]\]\s+(.+)$/);
                        if (checkedMatch) {
                          return <p key={i} className="ml-4 flex items-center gap-2 line-through opacity-60"><span className="text-[var(--totk-light-green)]">☑</span>{renderInlineMarkdown(checkedMatch[1])}</p>;
                        }
                        
                        // Blockquote
                        const quoteMatch = line.match(/^>\s*(.*)$/);
                        if (quoteMatch) {
                          return <p key={i} className="ml-2 border-l-2 border-[var(--totk-dark-ocher)] pl-3 italic text-[var(--botw-pale)] opacity-80">{renderInlineMarkdown(quoteMatch[1])}</p>;
                        }
                        
                        // Horizontal rule
                        if (line.match(/^[-_*]{3,}$/)) {
                          return <hr key={i} className="my-2 border-[var(--totk-dark-ocher)]" />;
                        }
                        
                        // Regular paragraph with inline markdown
                        return <p key={i}>{renderInlineMarkdown(line)}</p>;
                      })}
                    </div>
                  ) : (
                    <span className="text-sm italic text-[var(--botw-pale)] opacity-50">
                      Click to add a description...
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Checklist */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-medium text-[var(--botw-pale)]">
                  <i className="fa-solid fa-square-check" /> Checklist
                </h4>
                <div className="flex gap-2">
                  {checklistDone > 0 && (
                    <button
                      onClick={() => setHideCheckedItems(!hideCheckedItems)}
                      className="rounded px-2 py-1 text-xs text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50"
                    >
                      {hideCheckedItems ? "Show checked" : "Hide checked"}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {checklistTotal > 0 && (
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-[var(--botw-pale)]">
                    <span>{checklistPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--totk-dark-ocher)]">
                    <div
                      className={`h-full transition-all ${checklistPercent === 100 ? "bg-green-500" : "bg-[var(--totk-light-green)]"}`}
                      style={{ width: `${checklistPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Checklist Items */}
              <div className="space-y-1">
                {displayedChecklist.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--totk-dark-ocher)]/30"
                  >
                    <button
                      onClick={() => toggleChecklistItem(item._id)}
                      className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                        item.checked
                          ? "border-[var(--totk-light-green)] bg-[var(--totk-light-green)] text-[var(--totk-brown)]"
                          : "border-[var(--totk-dark-ocher)]"
                      }`}
                    >
                      {item.checked && <i className="fa-solid fa-check text-xs" />}
                    </button>
                    <span
                      className={`flex-1 text-sm ${
                        item.checked ? "text-[var(--botw-pale)] line-through opacity-50" : "text-[var(--botw-pale)]"
                      }`}
                    >
                      {item.text}
                    </span>
                    <button
                      onClick={() => removeChecklistItem(item._id)}
                      className="text-[var(--botw-pale)] opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      <i className="fa-solid fa-xmark text-xs" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Checklist Item */}
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
                  className="flex-1 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#1a1615] px-3 py-2 text-sm text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none"
                  placeholder="Add an item..."
                />
                <button
                  onClick={addChecklistItem}
                  disabled={!newChecklistItem.trim()}
                  className="rounded-lg bg-[var(--totk-dark-ocher)] px-3 py-2 text-sm text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/80 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Comments */}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--botw-pale)]">
                <i className="fa-solid fa-comment" /> Activity
              </h4>

              {/* Add Comment */}
              <div className="mb-4 flex gap-2">
                <div className="h-8 w-8 overflow-hidden rounded-full bg-[var(--totk-dark-ocher)]">
                  {currentUser?.avatar ? (
                    <img src={currentUser.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-[var(--botw-pale)]">
                      {currentUser?.username?.charAt(0).toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#1a1615] px-3 py-2 text-sm text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none"
                    placeholder="Write a comment..."
                    rows={2}
                  />
                  {newComment.trim() && (
                    <button
                      onClick={addComment}
                      className="mt-2 rounded bg-[var(--totk-light-green)] px-3 py-1 text-xs font-medium text-[var(--totk-brown)]"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>

              {/* Comment List */}
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment._id} className="group flex gap-2">
                    <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[var(--totk-dark-ocher)]">
                      {comment.author.avatar ? (
                        <img src={comment.author.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-[var(--botw-pale)]">
                          {comment.author.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--botw-pale)]">
                            {comment.author.username}
                          </span>
                          <span className="text-xs text-[var(--botw-pale)] opacity-50">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteComment(comment._id)}
                          className="rounded p-1 text-[var(--botw-pale)] opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                          title="Delete comment"
                        >
                          <i className="fa-solid fa-trash-can text-xs" />
                        </button>
                      </div>
                      <p className="mt-1 rounded bg-[#1a1615] p-2 text-sm text-[var(--botw-pale)]">
                        {comment.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-full space-y-3 lg:w-48">
            <h5 className="text-xs font-medium uppercase tracking-wide text-[var(--botw-pale)] opacity-70">
              Add to card
            </h5>

            {/* Members */}
            <div className="relative">
              <button
                onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                className="flex w-full items-center gap-2 rounded-lg bg-[var(--totk-dark-ocher)]/50 px-3 py-2 text-sm text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]"
              >
                <i className="fa-solid fa-user" />
                Members
              </button>
              {showAssigneeDropdown && (
                <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#1a1615]">
                  {mods.map((mod) => (
                    <button
                      key={mod.discordId}
                      onClick={() => toggleAssignee(mod)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--totk-dark-ocher)]/50"
                    >
                      <div className="h-6 w-6 overflow-hidden rounded-full bg-[var(--totk-dark-ocher)]">
                        {mod.avatar ? (
                          <img src={mod.avatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--botw-pale)]">
                            {mod.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="flex-1 text-sm text-[var(--botw-pale)]">{mod.username}</span>
                      {assignees.find((a) => a.discordId === mod.discordId) && (
                        <i className="fa-solid fa-check text-[var(--totk-light-green)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned Members Display */}
            {assignees.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {assignees.map((a) => (
                  <div
                    key={a.discordId}
                    className="h-8 w-8 overflow-hidden rounded-full border-2 border-[var(--botw-warm-black)] bg-[var(--totk-dark-ocher)]"
                    title={a.username}
                  >
                    {a.avatar ? (
                      <img src={a.avatar} alt={a.username} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[var(--botw-pale)]">
                        {a.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Due Date & Time */}
            <div>
              <label className="mb-1 flex items-center gap-2 text-sm text-[var(--botw-pale)]">
                <i className="fa-solid fa-clock" />
                Due Date & Time
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#1a1615] px-3 py-2 text-sm text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none [color-scheme:dark]"
              />
            </div>

            {/* Column */}
            <div>
              <label className="mb-1 flex items-center gap-2 text-sm text-[var(--botw-pale)]">
                <i className="fa-solid fa-columns" />
                Column
              </label>
              <select
                value={column}
                onChange={(e) => setColumn(e.target.value as Column)}
                className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#1a1615] px-3 py-2 text-sm text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none"
              >
                {COLUMNS.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="mb-1 flex items-center gap-2 text-sm text-[var(--botw-pale)]">
                <i className="fa-solid fa-flag" />
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#1a1615] px-3 py-2 text-sm text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none"
              >
                {(["low", "medium", "high", "urgent"] as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Repeating */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsRepeating(!isRepeating)}
                className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                  isRepeating
                    ? "border-[var(--totk-light-green)] bg-[var(--totk-light-green)] text-[var(--totk-brown)]"
                    : "border-[var(--totk-dark-ocher)]"
                }`}
              >
                {isRepeating && <i className="fa-solid fa-check text-xs" />}
              </button>
              <span className="text-sm text-[var(--botw-pale)]">Repeating</span>
            </div>

            {isRepeating && (
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[#1a1615] px-3 py-2 text-sm text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none"
              >
                {(["daily", "weekly", "monthly", "quarterly"] as Frequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            )}

            <hr className="border-[var(--totk-dark-ocher)]" />

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleSubmit}
                disabled={saving || !title.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--totk-light-green)] px-3 py-2 text-sm font-medium text-[var(--totk-brown)] hover:bg-[var(--totk-light-green)]/80 disabled:opacity-50"
              >
                {saving ? "Saving..." : isNew ? "Create Task" : "Save Changes"}
              </button>

              {!isNew && onDelete && (
                <button
                  onClick={onDelete}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-red-500/50 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
                >
                  <i className="fa-solid fa-trash-can" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function AdminTodoPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [isNewTask, setIsNewTask] = useState(false);
  const [newTaskColumn, setNewTaskColumn] = useState<Column>("todo");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);

  const canAccess = isAdmin || isModerator;

  // Filter tasks based on "My Tasks" toggle
  const filteredTasks = useMemo(() => {
    if (!showMyTasksOnly || !user) return tasks;
    return tasks.filter((task) => 
      task.assignees.some((a) => a.discordId === user.id)
    );
  }, [tasks, showMyTasksOnly, user]);

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    const grouped: Record<Column, Task[]> = {
      repeating: [],
      todo: [],
      in_progress: [],
      pending: [],
      done: [],
    };
    for (const task of filteredTasks) {
      if (grouped[task.column]) {
        grouped[task.column].push(task);
      }
    }
    // Sort by order within each column
    for (const col of Object.keys(grouped) as Column[]) {
      grouped[col].sort((a, b) => a.order - b.order);
    }
    return grouped;
  }, [filteredTasks]);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tasks", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load tasks");
        return;
      }
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  // Fetch mods
  const fetchMods = useCallback(async () => {
    if (!canAccess) return;
    try {
      const res = await fetch("/api/admin/tasks/mods", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMods(Array.isArray(data.mods) ? data.mods : []);
      }
    } catch {
      // Silent fail for mods list
    }
  }, [canAccess]);

  useEffect(() => {
    fetchTasks();
    fetchMods();
  }, [fetchTasks, fetchMods]);

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t._id === event.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find((t) => t._id === active.id);
    if (!activeTask) return;

    // Check if dragging over a column
    const overColumn = COLUMNS.find((c) => c.id === over.id);
    if (overColumn && activeTask.column !== overColumn.id) {
      setTasks((prev) =>
        prev.map((t) =>
          t._id === active.id ? { ...t, column: overColumn.id } : t
        )
      );
    }

    // Check if dragging over another task
    const overTask = tasks.find((t) => t._id === over.id);
    if (overTask && activeTask.column !== overTask.column) {
      setTasks((prev) =>
        prev.map((t) =>
          t._id === active.id ? { ...t, column: overTask.column } : t
        )
      );
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeTask = tasks.find((t) => t._id === active.id);
    if (!activeTask) return;

    // Find the target column
    let targetColumn: Column = activeTask.column;
    const overColumn = COLUMNS.find((c) => c.id === over.id);
    const overTask = tasks.find((t) => t._id === over.id);

    if (overColumn) {
      targetColumn = overColumn.id;
    } else if (overTask) {
      targetColumn = overTask.column;
    }

    // Calculate new order
    const columnTasks = tasks
      .filter((t) => t.column === targetColumn && t._id !== active.id)
      .sort((a, b) => a.order - b.order);

    let newOrder = 0;
    if (overTask && overTask._id !== active.id) {
      const overIndex = columnTasks.findIndex((t) => t._id === over.id);
      if (overIndex >= 0) {
        newOrder = overIndex;
      }
    } else {
      newOrder = columnTasks.length;
    }

    // Update local state
    setTasks((prev) => {
      const updated = prev.map((t) => {
        if (t._id === active.id) {
          return { ...t, column: targetColumn, order: newOrder };
        }
        return t;
      });
      return updated;
    });

    // Persist to server
    try {
      const res = await fetch(`/api/admin/tasks/${active.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: targetColumn, order: newOrder }),
      });
      
      if (res.ok) {
        const data = await res.json();
        // Check if a new repeating task was created
        if (data.newTask) {
          setSuccess(`Repeating task completed! New instance created for ${formatDate(data.newTask.dueDate)}`);
          setTimeout(() => setSuccess(null), 5000);
          fetchTasks();
        }
      }
    } catch {
      // Revert on error
      fetchTasks();
    }
  };

  // Task CRUD handlers
  const handleTaskClick = (task: Task) => {
    setModalTask(task);
    setIsNewTask(false);
  };

  const handleAddTask = (column: Column) => {
    setModalTask(null);
    setNewTaskColumn(column);
    setIsNewTask(true);
  };

  const handleCloseModal = () => {
    setModalTask(null);
    setIsNewTask(false);
  };

  const handleSaveTask = async (data: Partial<Task>) => {
    try {
      if (isNewTask) {
        const res = await fetch("/api/admin/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, column: data.column ?? newTaskColumn }),
        });
        if (!res.ok) throw new Error("Failed to create task");
      } else if (modalTask) {
        const res = await fetch(`/api/admin/tasks/${modalTask._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to update task");
      }
      handleCloseModal();
      fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleDeleteTask = async () => {
    if (!modalTask) return;
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      const res = await fetch(`/api/admin/tasks/${modalTask._id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete task");
      handleCloseModal();
      fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // Loading state
  if (sessionLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Loading..." variant="inline" size="lg" />
      </div>
    );
  }

  // Access denied
  if (!canAccess) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="mb-4 text-xl font-bold text-[var(--totk-light-ocher)]">Access Denied</h1>
          <p className="text-[var(--botw-pale)]">
            You must be a moderator or admin to access the todo list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
        <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        <h1 className="text-center text-xl font-bold text-[var(--totk-light-ocher)] sm:text-2xl md:text-3xl">
          Mod Todo List
        </h1>
        <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-black)]/30 px-4 py-3">
        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--botw-pale)]">View:</span>
          <div className="flex rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)]/50">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-sm transition-colors ${
                viewMode === "kanban"
                  ? "bg-[var(--totk-dark-ocher)] text-[var(--totk-light-ocher)]"
                  : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50"
              }`}
            >
              <i className="fa-solid fa-columns" />
              Board
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-sm transition-colors ${
                viewMode === "table"
                  ? "bg-[var(--totk-dark-ocher)] text-[var(--totk-light-ocher)]"
                  : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50"
              }`}
            >
              <i className="fa-solid fa-table-list" />
              Table
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--botw-pale)]">
            <input
              type="checkbox"
              checked={showMyTasksOnly}
              onChange={(e) => setShowMyTasksOnly(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)] focus:ring-offset-0"
            />
            <span>My Tasks Only</span>
          </label>
          
          {showMyTasksOnly && (
            <span className="text-xs text-[var(--botw-pale)] opacity-70">
              Showing {filteredTasks.length} of {tasks.length} tasks
            </span>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {success && (
        <div className="mx-auto mb-4 max-w-3xl rounded-lg border-2 border-[var(--totk-light-green)]/50 bg-[var(--totk-light-green)]/20 px-4 py-3 text-center text-[var(--totk-light-green)]">
          <i className="fa-solid fa-check-circle mr-2" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 hover:text-white">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mx-auto mb-4 max-w-3xl rounded-lg border-2 border-red-500/50 bg-red-500/20 px-4 py-3 text-center text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 hover:text-white">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loading message="Loading tasks..." variant="inline" size="lg" />
        </div>
      ) : viewMode === "kanban" ? (
        /* Kanban Board */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex w-full gap-4 pb-4">
            {COLUMNS.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn[column.id]}
                onTaskClick={handleTaskClick}
                onAddTask={handleAddTask}
              />
            ))}
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeTask && (
              <div className="rotate-3 opacity-90">
                <TaskCard task={activeTask} onClick={() => {}} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        /* Table View */
        <TableView
          tasks={filteredTasks}
          onTaskClick={handleTaskClick}
        />
      )}

      {/* Task Modal */}
      {(modalTask || isNewTask) && (
        <TaskModal
          task={modalTask}
          isNew={isNewTask}
          defaultColumn={newTaskColumn}
          mods={mods}
          currentUser={user ? { 
            id: user.id, 
            username: user.username, 
            avatar: user.avatar 
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
              : undefined 
          } : null}
          onClose={handleCloseModal}
          onSave={handleSaveTask}
          onDelete={modalTask ? handleDeleteTask : undefined}
        />
      )}
    </div>
  );
}
