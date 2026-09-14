"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, ReactNode, SetStateAction } from "react";
import {
  AlarmClock,
  Archive,
  Bell,
  Bold,
  Briefcase,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  CopyPlus,
  Circle,
  ClipboardList,
  Code2,
  Diamond,
  ExternalLink,
  FileText,
  FolderInput,
  Globe2,
  Link2,
  List as ListIcon,
  ListOrdered,
  Lock,
  Mail,
  Merge,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Quote,
  Rocket,
  Repeat2,
  Search,
  SlidersHorizontal,
  Share2,
  Sparkles,
  Star,
  Timer,
  Italic,
  Trash2,
  User,
  UserCircle,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import {
  PRIORITY_META,
  TASK_TEMPLATE_STORAGE_KEY,
  TASK_TYPE_META,
  uid,
} from "@/lib/store";
import type {
  SharePermission,
  StatusDefinition,
  Task,
  TaskMoveDestination,
  TaskPriority,
  TaskRecurrence,
  RecurrenceFrequency,
  TaskRelationshipKind,
  TaskStatus,
  TaskType,
  TaskWatcher,
  WatcherCandidate,
  AttachmentItem,
  CustomFieldDefinition,
  CustomFieldType,
} from "@/lib/types";
import { formatDateTime, humanFileSize } from "@/lib/utils";

interface TaskDrawerProps {
  task: Task;
  allTasks: Task[];
  moveDestinations: TaskMoveDestination[];
  watcherCandidates: WatcherCandidate[];
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onMoveTask: (destinationFolderPath: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMergeTask: (otherTaskId: string) => void;
  onConvertToSubtask: (parentTaskId: string) => void;
  onConvertToList: () => void;
  statusDefinitions: StatusDefinition[];
  onCreateStatus: (label: string, color: string) => void;
  onRenameStatus: (statusId: string, label: string, color: string) => void;
  onDeleteStatus: (statusId: string) => void;
  customFieldDefinitions: CustomFieldDefinition[];
  onCreateCustomField: (name: string, type: CustomFieldType) => void;
  onRenameCustomField: (fieldId: string, name: string) => void;
  onDeleteCustomField: (fieldId: string) => void;
}

type DrawerTab =
  | "overview"
  | "fields"
  | "subtasks"
  | "checklists"
  | "dependencies"
  | "attachments"
  | "comments"
  | "activity"
  | "time";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "fields", label: "Fields" },
  { id: "subtasks", label: "Subtasks" },
  { id: "checklists", label: "Checklists" },
  { id: "dependencies", label: "Dependencies" },
  { id: "attachments", label: "Attachments" },
  { id: "comments", label: "Comments" },
  { id: "activity", label: "Activity" },
  { id: "time", label: "Time" },
];

const taskTypes = Object.keys(TASK_TYPE_META) as TaskType[];

const TAG_PRESETS = [
  "To do",
  "In progress",
  "In process",
  "In review",
  "Complete",
  "Urgent",
  "High",
  "Normal",
  "Low",
] as const;

function getTagTheme(label: string) {
  const value = label.trim().toLowerCase();

  if (value.includes("urgent")) {
    return { background: "#feecec", color: "#dc2626", border: "#fecaca" };
  }

  if (value === "high" || value.includes("high priority")) {
    return { background: "#f3e8ff", color: "#7c3aed", border: "#ddd6fe" };
  }

  if (
    value.includes("in progress") ||
    value.includes("in process") ||
    value === "progress"
  ) {
    return { background: "#e8f2ff", color: "#2563eb", border: "#bfdbfe" };
  }

  if (value.includes("review")) {
    return { background: "#f3e8ff", color: "#9333ea", border: "#e9d5ff" };
  }

  if (
    value.includes("complete") ||
    value.includes("completed") ||
    value.includes("done")
  ) {
    return { background: "#e8f8ef", color: "#15803d", border: "#bbf7d0" };
  }

  if (value === "normal") {
    return { background: "#e8f2ff", color: "#2563eb", border: "#bfdbfe" };
  }

  if (value === "low") {
    return { background: "#f1f5f9", color: "#64748b", border: "#e2e8f0" };
  }

  if (
    value === "to do" ||
    value === "todo" ||
    value.includes("backlog")
  ) {
    return { background: "#f1f3f5", color: "#475569", border: "#d7dde5" };
  }

  const palette = [
    { background: "#fff3e8", color: "#c2410c", border: "#fed7aa" },
    { background: "#eef2ff", color: "#4f46e5", border: "#c7d2fe" },
    { background: "#ecfeff", color: "#0f766e", border: "#a5f3fc" },
    { background: "#fdf2f8", color: "#be185d", border: "#fbcfe8" },
    { background: "#f7fee7", color: "#4d7c0f", border: "#d9f99d" },
  ];

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return palette[hash % palette.length];
}

function TaskTypeIcon({ type, size = 17 }: { type: TaskType; size?: number }) {
  if (type === "MILESTONE") return <Diamond size={size} />;
  if (type === "CAMPAIGN_LAUNCH") return <Rocket size={size} />;
  if (type === "CANDIDATE") return <User size={size} />;
  if (type === "FORM_RESPONSE") return <ClipboardList size={size} />;
  if (type === "JOB_POSTING") return <Briefcase size={size} />;
  if (type === "MEETING_NOTE") return <FileText size={size} />;
  if (type === "PERSON") return <UserCircle size={size} />;
  return <Circle size={size} />;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function formatElapsedTimer(startedAt: string | null, now = Date.now()) {
  if (!startedAt) return "00:00";
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return "00:00";
  const total = Math.max(0, Math.floor((now - started) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}



async function fileToStoredAttachment(file: File): Promise<AttachmentItem> {
  const maxPersistentSize = 2 * 1024 * 1024;
  if (file.size > maxPersistentSize) {
    throw new Error(`${file.name} is larger than 2 MB. This standalone local build stores uploaded file contents in browser storage, so choose a smaller file or attach it by link.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

  return {
    id: uid("attachment"),
    name: file.name,
    size: file.size,
    kind: "FILE",
    dataUrl,
    mimeType: file.type,
  };
}

function formatTrackedSeconds(totalSeconds: number) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function improveDescriptionLocally(value: string) {
  const source = value.trim();
  if (!source) return "";

  return source
    .split("\n")
    .map((line) => {
      const trimmed = line.trim().replace(/\s+/g, " ");
      if (!trimmed) return "";

      // Preserve common Markdown prefixes while polishing the text after them.
      const match = trimmed.match(/^(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)(.*)$/);
      const prefix = match?.[1] ?? "";
      let body = match?.[2] ?? trimmed;

      body = body.charAt(0).toUpperCase() + body.slice(1);
      if (body && !/[.!?:;`]$/.test(body)) body += ".";
      return `${prefix}${body}`;
    })
    .join("\n");
}

function summarizeDescriptionLocally(value: string) {
  const clean = value
    .replace(/[`*_>#\[\]()~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "";

  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];
  const summary = sentences.slice(0, 2).join(" ").trim();
  return summary.length <= 220 ? summary : `${summary.slice(0, 217).trim()}…`;
}

export default function TaskDrawer({
  task: rawTask,
  allTasks,
  moveDestinations,
  watcherCandidates,
  onClose,
  onUpdate,
  onMoveTask,
  onDuplicate,
  onDelete,
  onMergeTask,
  onConvertToSubtask,
  onConvertToList,
  statusDefinitions,
  onCreateStatus,
  onRenameStatus,
  onDeleteStatus,
  customFieldDefinitions,
  onCreateCustomField,
  onRenameCustomField,
  onDeleteCustomField,
}: TaskDrawerProps) {
  // Older tasks already saved in localStorage may not have fields that were
  // introduced in later Rundesk iterations. Normalize the task at the drawer
  // boundary as a second line of defence so UI code never calls map/reduce on
  // undefined values.
  const task = useMemo<Task>(() => ({
    ...rawTask,
    tags: Array.isArray(rawTask.tags) ? rawTask.tags : [],
    assignees: Array.isArray(rawTask.assignees) ? rawTask.assignees : [],
    linkedDocs: Array.isArray(rawTask.linkedDocs) ? rawTask.linkedDocs : [],
    linkedWork: Array.isArray(rawTask.linkedWork) ? rawTask.linkedWork : [],
    watchers: Array.isArray(rawTask.watchers) ? rawTask.watchers : [],
    permissions: Array.isArray(rawTask.permissions) ? rawTask.permissions : [],
    subtasks: Array.isArray(rawTask.subtasks) ? rawTask.subtasks : [],
    checklist: Array.isArray(rawTask.checklist) ? rawTask.checklist : [],
    dependencyIds: Array.isArray(rawTask.dependencyIds) ? rawTask.dependencyIds : [],
    attachments: Array.isArray(rawTask.attachments) ? rawTask.attachments : [],
    comments: Array.isArray(rawTask.comments)
      ? rawTask.comments.map((comment) => ({
          ...comment,
          attachments: Array.isArray(comment.attachments) ? comment.attachments : [],
        }))
      : [],
    relationships: Array.isArray(rawTask.relationships) ? rawTask.relationships : [],
    timeEntries: Array.isArray(rawTask.timeEntries) ? rawTask.timeEntries : [],
    activity: Array.isArray(rawTask.activity) ? rawTask.activity : [],
    customFieldValues:
      rawTask.customFieldValues && typeof rawTask.customFieldValues === "object"
        ? rawTask.customFieldValues
        : {},
  }), [rawTask]);

  const safeAllTasks = Array.isArray(allTasks) ? allTasks : [];
  const safeWatcherCandidates = Array.isArray(watcherCandidates) ? watcherCandidates : [];

  const [tab, setTab] = useState<DrawerTab>("overview");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [checkTitle, setCheckTitle] = useState("");
  const [checkAssigneeId, setCheckAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [dependencyId, setDependencyId] = useState("");
  const [dependencyKind, setDependencyKind] = useState<TaskRelationshipKind>("BLOCKS");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentLinkName, setAttachmentLinkName] = useState("");
  const [attachmentLinkUrl, setAttachmentLinkUrl] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentDragActive, setCommentDragActive] = useState(false);
  const [commentMentionOpen, setCommentMentionOpen] = useState(false);
  const [commentMentionQuery, setCommentMentionQuery] = useState("");
  const [attachmentDragActive, setAttachmentDragActive] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [timeDescription, setTimeDescription] = useState("");
  const [customFieldComposerOpen, setCustomFieldComposerOpen] = useState(false);
  const [customFieldName, setCustomFieldName] = useState("");
  const [customFieldType, setCustomFieldType] = useState<CustomFieldType>("TEXT");
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState("");
  const [tagEditor, setTagEditor] = useState<{ index: number | null; value: string } | null>(null);
  const [systemBadgeEditor, setSystemBadgeEditor] = useState<"status" | "priority" | null>(null);
  const [modal, setModal] = useState<"move" | "watchers" | "share" | "template" | "recurrence" | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowSubmenu, setOverflowSubmenu] = useState<"favorite" | "reminder" | "add" | "merge" | "convert" | "templates" | "relationships" | "tasktype" | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const statusMeta = (statusId: string) => statusDefinitions.find((status) => status.id === statusId) ?? { id: statusId, label: statusId, color: "#667085" };

  useEffect(() => {
    setOverflowOpen(false);
    setOverflowSubmenu(null);
    setTypeOpen(false);
    setTagEditor(null);
    setSystemBadgeEditor(null);
  }, [task.id]);

  useEffect(() => {
    const editor = descriptionRef.current;
    if (!editor || document.activeElement === editor) return;
    const html = sanitizeDescriptionHtml(legacyDescriptionToHtml(task.description));
    if (editor.innerHTML !== html) editor.innerHTML = html;
  }, [task.id, task.description]);

  useEffect(() => {
    if (!task.timerStartedAt) return;
    setTimerNow(Date.now());
    const timer = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [task.timerStartedAt]);

  const dependencyTasks = useMemo(
    () => safeAllTasks.filter((candidate) => candidate.id !== task.id && !task.relationships.some((relationship) => relationship.taskId === candidate.id && relationship.kind === dependencyKind)),
    [safeAllTasks, task.relationships, task.id, dependencyKind]
  );

  const memberOptions = useMemo(() => {
    const map = new Map<string, WatcherCandidate>();
    [...safeWatcherCandidates, ...task.assignees].forEach((member) => {
      const key = member.email?.toLowerCase() || member.name?.toLowerCase() || member.id;
      if (key && !map.has(key)) map.set(key, member);
    });
    return [...map.values()];
  }, [safeWatcherCandidates, task.assignees]);

  const mentionOptions = useMemo(() => {
    const query = normalizeSearch(commentMentionQuery);
    return memberOptions
      .filter((member) => {
        if (!query) return true;
        return normalizeSearch(member.name).includes(query) || normalizeSearch(member.email).includes(query);
      })
      .slice(0, 8);
  }, [memberOptions, commentMentionQuery]);

  const totalTrackedSeconds = useMemo(() => {
    const saved = task.timeEntries.reduce((sum, entry) => sum + Math.max(0, entry.durationSeconds || 0), 0);
    if (!task.timerStartedAt) return saved;
    const live = Math.max(0, Math.floor((timerNow - new Date(task.timerStartedAt).getTime()) / 1000));
    return saved + live;
  }, [task.timeEntries, task.timerStartedAt, timerNow]);

  const filteredTypes = useMemo(() => {
    const q = normalizeSearch(typeSearch);
    if (!q) return taskTypes;
    return taskTypes.filter((type) => TASK_TYPE_META[type].label.toLowerCase().includes(q));
  }, [typeSearch]);

  const existingTagOptions = useMemo(() => {
    const query = normalizeSearch(tagEditor?.value ?? "");
    const seen = new Set<string>();
    const options = [...TAG_PRESETS, ...safeAllTasks.flatMap((candidate) => candidate.tags)];

    return options
      .filter((tag) => {
        const key = tag.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((tag) => !query || tag.toLowerCase().includes(query))
      .filter((tag) => {
        if (tagEditor?.index !== null && tagEditor?.index !== undefined) {
          const current = task.tags[tagEditor.index];
          return tag.toLowerCase() !== current?.toLowerCase();
        }

        return !task.tags.some((selected) => selected.toLowerCase() === tag.toLowerCase());
      });
  }, [allTasks, tagEditor, task.tags]);

  const update = (patch: Partial<Task>, activityText?: string) => {
    const now = new Date().toISOString();
    const next: Task = {
      ...task,
      ...patch,
      updatedAt: now,
      activity: activityText
        ? [{ id: uid("activity"), text: activityText, createdAt: now }, ...task.activity]
        : task.activity,
    };
    onUpdate(next);
  };

  const startTaskTimer = (description = "") => {
    if (task.timerStartedAt) return;
    const startedAt = new Date().toISOString();
    update(
      { timerStartedAt: startedAt, timerDescription: description.trim() },
      description.trim() ? `Started timer · ${description.trim()}` : "Started timer"
    );
  };

  const stopTaskTimer = () => {
    if (!task.timerStartedAt) return;
    const endedAt = new Date().toISOString();
    const seconds = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(task.timerStartedAt).getTime()) / 1000));
    update(
      {
        timerStartedAt: null,
        timerDescription: "",
        timeEntries: [
          {
            id: uid("time"),
            description: task.timerDescription || "Task work",
            startedAt: task.timerStartedAt,
            endedAt,
            durationSeconds: seconds,
          },
          ...task.timeEntries,
        ],
      },
      `Stopped timer · ${formatTrackedSeconds(seconds)}`
    );
  };

  const uploadAttachments = async (files: File[], target: "task" | "comment") => {
    if (!files.length) return;
    try {
      const stored = await Promise.all(files.map(fileToStoredAttachment));
      if (target === "task") {
        update({ attachments: [...task.attachments, ...stored] }, `Added ${stored.length} attachment${stored.length === 1 ? "" : "s"}`);
        setAttachmentFiles([]);
      } else {
        setCommentFiles(files);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not attach file.");
    }
  };

  const addSubtask = () => {
    const title = subtaskTitle.trim();
    if (!title) return;
    update(
      { subtasks: [...task.subtasks, { id: uid("subtask"), title, done: false }] },
      `Added subtask “${title}”`
    );
    setSubtaskTitle("");
  };

  const addChecklistItem = () => {
    const title = checkTitle.trim();
    if (!title) return;
    update(
      { checklist: [...task.checklist, { id: uid("check"), title, done: false, assigneeId: checkAssigneeId || undefined }] },
      `Added checklist item “${title}”`
    );
    setCheckTitle("");
    setCheckAssigneeId("");
  };

  const handleCommentChange = (value: string, cursor: number) => {
    setComment(value);
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      setCommentMentionQuery(match[1] ?? "");
      setCommentMentionOpen(true);
    } else {
      setCommentMentionOpen(false);
      setCommentMentionQuery("");
    }
  };

  const insertCommentMention = (member: WatcherCandidate) => {
    const textarea = commentRef.current;
    const cursor = textarea?.selectionStart ?? comment.length;
    const beforeCursor = comment.slice(0, cursor);
    const afterCursor = comment.slice(cursor);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex < 0) return;
    const mentionLabel = member.name?.trim() || member.email;
    const nextValue = `${beforeCursor.slice(0, atIndex)}@${mentionLabel} ${afterCursor}`;
    const nextCursor = atIndex + mentionLabel.length + 2;
    setComment(nextValue);
    setCommentMentionOpen(false);
    setCommentMentionQuery("");
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const addComment = async () => {
    const body = comment.trim();
    if (!body && commentFiles.length === 0) return;
    const now = new Date().toISOString();
    try {
      const attachments = commentFiles.length ? await Promise.all(commentFiles.map(fileToStoredAttachment)) : [];
      update(
        { comments: [...task.comments, { id: uid("comment"), body, createdAt: now, attachments }] },
        "Added a comment"
      );
      setComment("");
      setCommentFiles([]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not attach file to comment.");
    }
  };

  const selectExistingTag = (value: string) => {
    if (!tagEditor) return;

    const cleanValue = value.trim();
    if (!cleanValue) return;

    if (tagEditor.index === null) {
      if (task.tags.some((tag) => tag.toLowerCase() === cleanValue.toLowerCase())) {
        setTagEditor(null);
        return;
      }

      update({ tags: [...task.tags, cleanValue] }, `Added tag “${cleanValue}”`);
    } else {
      const previous = task.tags[tagEditor.index];
      const nextTags = task.tags.map((tag, index) =>
        index === tagEditor.index ? cleanValue : tag
      );

      update({ tags: nextTags }, `Changed tag “${previous}” to “${cleanValue}”`);
    }

    setTagEditor(null);
  };

  const saveTag = () => {
    if (!tagEditor) return;
    selectExistingTag(tagEditor.value);
  };

  const removeEditedTag = () => {
    if (!tagEditor || tagEditor.index === null) return;
    const previous = task.tags[tagEditor.index];
    update({ tags: task.tags.filter((_, index) => index !== tagEditor.index) }, `Removed tag “${previous}”`);
    setTagEditor(null);
  };

  const chooseType = (type: TaskType) => {
    update({ taskType: type }, `Changed task type to ${TASK_TYPE_META[type].label}`);
    setTypeOpen(false);
    setTypeSearch("");
  };

  const fillTypeWithAI = () => {
    const text = `${task.title} ${task.description}`.toLowerCase();
    let suggested: TaskType = "TASK";
    if (text.includes("milestone")) suggested = "MILESTONE";
    else if (text.includes("campaign") || text.includes("launch")) suggested = "CAMPAIGN_LAUNCH";
    else if (text.includes("candidate") || text.includes("interview")) suggested = "CANDIDATE";
    else if (text.includes("form") || text.includes("response")) suggested = "FORM_RESPONSE";
    else if (text.includes("job") || text.includes("hiring")) suggested = "JOB_POSTING";
    else if (text.includes("meeting") || text.includes("notes")) suggested = "MEETING_NOTE";
    else if (text.includes("person") || text.includes("contact")) suggested = "PERSON";
    chooseType(suggested);
  };


  const descriptionToPlainText = (value: string) =>
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const escapeDescriptionHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const inlineMarkdownToHtml = (value: string) => {
    let next = escapeDescriptionHtml(value);
    next = next.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    next = next.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    next = next.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    next = next.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    next = next.replace(/`([^`]+)`/g, "<code>$1</code>");
    return next;
  };

  const legacyDescriptionToHtml = (value: string) => {
    if (!value.trim()) return "";
    if (/<(?:p|div|br|strong|em|code|a|h[1-6]|ul|ol|li|blockquote)\b/i.test(value)) {
      return value;
    }

    const lines = value.split(/\r?\n/);
    const parts: string[] = [];
    let listType: "ul" | "ol" | null = null;

    const closeList = () => {
      if (listType) parts.push(`</${listType}>`);
      listType = null;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        closeList();
        parts.push("<p><br></p>");
        return;
      }

      const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
      const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (bullet) {
        if (listType !== "ul") {
          closeList();
          listType = "ul";
          parts.push("<ul>");
        }
        parts.push(`<li>${inlineMarkdownToHtml(bullet[1])}</li>`);
        return;
      }
      if (numbered) {
        if (listType !== "ol") {
          closeList();
          listType = "ol";
          parts.push("<ol>");
        }
        parts.push(`<li>${inlineMarkdownToHtml(numbered[1])}</li>`);
        return;
      }

      closeList();
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        parts.push(`<h2>${inlineMarkdownToHtml(heading[1])}</h2>`);
        return;
      }
      const quote = trimmed.match(/^>\s*(.+)$/);
      if (quote) {
        parts.push(`<blockquote>${inlineMarkdownToHtml(quote[1])}</blockquote>`);
        return;
      }
      parts.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
    });

    closeList();
    return parts.join("");
  };

  const sanitizeDescriptionHtml = (value: string) => {
    if (typeof document === "undefined") return value;
    const template = document.createElement("template");
    template.innerHTML = value;
    template.content.querySelectorAll("script,style,iframe,object,embed,form,input,button").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on") || name === "style" || name === "class" || name === "id") {
          node.removeAttribute(attribute.name);
        }
      });
      if (node.tagName === "A") {
        const anchor = node as HTMLAnchorElement;
        const href = anchor.getAttribute("href") ?? "";
        if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) anchor.removeAttribute("href");
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noreferrer");
      }
    });
    return template.innerHTML;
  };

  const persistDescriptionFromEditor = (activityText?: string) => {
    const editor = descriptionRef.current;
    if (!editor) return;
    const html = sanitizeDescriptionHtml(editor.innerHTML);
    if (html !== task.description) update({ description: html }, activityText);
  };

  const runDescriptionCommand = (command: string, value?: string) => {
    const editor = descriptionRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    persistDescriptionFromEditor();
  };

  const formatDescriptionCode = () => {
    const editor = descriptionRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const selected = selection?.toString() || "code";
    document.execCommand("insertHTML", false, `<code>${escapeDescriptionHtml(selected)}</code>`);
    persistDescriptionFromEditor();
  };

  const addDescriptionLink = () => {
    const editor = descriptionRef.current;
    if (!editor) return;
    editor.focus();
    const url = window.prompt("Enter link URL", "https://");
    if (!url) return;
    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl) && !/^mailto:/i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    const selection = window.getSelection();
    const selected = selection?.toString().trim();
    if (selected) {
      document.execCommand("createLink", false, normalizedUrl);
    } else {
      const safeUrl = escapeDescriptionHtml(normalizedUrl);
      document.execCommand("insertHTML", false, `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`);
    }
    persistDescriptionFromEditor();
  };

  const handleDescriptionKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

    const editor = descriptionRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    let element: Element | null = null;
    if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
      element = range.startContainer as Element;
    } else {
      element = range.startContainer.parentElement;
    }

    const listItem = element?.closest("li") as HTMLLIElement | null;
    if (!listItem || !editor.contains(listItem)) return;

    event.preventDefault();
    if (!range.collapsed) range.deleteContents();

    const list = listItem.parentElement;
    if (!list || (list.tagName !== "UL" && list.tagName !== "OL")) return;

    const visibleText = (listItem.textContent ?? "").replace(/\u200B/g, "").trim();

    // Pressing Enter on an empty list item exits the list, matching normal editors.
    if (!visibleText) {
      const paragraph = document.createElement("p");
      paragraph.appendChild(document.createElement("br"));
      list.parentNode?.insertBefore(paragraph, list.nextSibling);
      listItem.remove();
      if (!list.querySelector("li")) list.remove();

      const caret = document.createRange();
      caret.selectNodeContents(paragraph);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      window.requestAnimationFrame(() => persistDescriptionFromEditor());
      return;
    }

    const nextItem = document.createElement("li");
    try {
      const tail = document.createRange();
      tail.setStart(range.startContainer, range.startOffset);
      tail.setEnd(listItem, listItem.childNodes.length);
      const trailingContent = tail.extractContents();
      if (trailingContent.childNodes.length > 0) nextItem.appendChild(trailingContent);
    } catch {
      // If the browser cannot split the range, create a clean next item.
    }

    if (!nextItem.hasChildNodes()) nextItem.appendChild(document.createElement("br"));
    list.insertBefore(nextItem, listItem.nextSibling);

    const caret = document.createRange();
    caret.selectNodeContents(nextItem);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    window.requestAnimationFrame(() => persistDescriptionFromEditor());
  };

  const improveDescription = () => {
    const source = descriptionRef.current?.innerHTML ?? task.description;
    const improved = improveDescriptionLocally(descriptionToPlainText(source));
    if (!improved) {
      window.alert("Add a description first.");
      descriptionRef.current?.focus();
      return;
    }
    const html = improved
      .split("\n")
      .map((line) => line ? `<p>${escapeDescriptionHtml(line)}</p>` : "<p><br></p>")
      .join("");
    if (descriptionRef.current) descriptionRef.current.innerHTML = html;
    update({ description: html }, "Improved task description");
  };

  const summarizeDescription = () => {
    const source = descriptionRef.current?.innerHTML ?? task.description;
    const summary = summarizeDescriptionLocally(descriptionToPlainText(source));
    if (!summary) {
      window.alert("Add a description first.");
      descriptionRef.current?.focus();
      return;
    }
    const html = `<p>${escapeDescriptionHtml(summary)}</p>`;
    if (descriptionRef.current) descriptionRef.current.innerHTML = html;
    update({ description: html }, "Summarized task description");
  };

  const isWatching = task.watchers.some((watcher) => watcher.id === "watcher_me");

  const closeOverflow = () => {
    setOverflowOpen(false);
    setOverflowSubmenu(null);
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      window.alert(successMessage);
    } catch {
      window.prompt("Copy this value:", value);
    }
  };

  const setReminderMinutes = (minutes: number) => {
    const reminder = new Date(Date.now() + minutes * 60_000).toISOString();
    update({ reminderAt: reminder }, "Added Inbox reminder");
    closeOverflow();
  };

  const setReminderTomorrow = () => {
    const reminder = new Date();
    reminder.setDate(reminder.getDate() + 1);
    reminder.setHours(8, 0, 0, 0);
    update({ reminderAt: reminder.toISOString() }, "Added Inbox reminder for tomorrow");
    closeOverflow();
  };

  const setReminderNextWeek = () => {
    const reminder = new Date();
    const daysUntilMonday = ((8 - reminder.getDay()) % 7) || 7;
    reminder.setDate(reminder.getDate() + daysUntilMonday);
    reminder.setHours(8, 0, 0, 0);
    update({ reminderAt: reminder.toISOString() }, "Added Inbox reminder for next week");
    closeOverflow();
  };

  const applyTemplate = () => {
    const raw = window.localStorage.getItem(TASK_TEMPLATE_STORAGE_KEY);
    let templates: any[] = [];
    try { templates = raw ? JSON.parse(raw) : []; } catch { templates = []; }
    if (!Array.isArray(templates) || templates.length === 0) {
      window.alert("No saved task templates yet.");
      return;
    }
    const names = templates.map((item) => item.name).join("\n");
    const chosen = window.prompt(`Type the template name to apply:\n\n${names}`)?.trim();
    if (!chosen) return;
    const template = templates.find((item) => String(item.name).toLowerCase() === chosen.toLowerCase());
    if (!template?.task) { window.alert("Template not found."); return; }
    update({
      title: template.task.title ?? task.title,
      description: template.task.description ?? task.description,
      taskType: template.task.taskType ?? task.taskType,
      priority: template.task.priority ?? task.priority,
      status: template.task.status ?? task.status,
      tags: Array.isArray(template.task.tags) ? template.task.tags : task.tags,
      subtasks: Array.isArray(template.task.subtasks) ? template.task.subtasks : task.subtasks,
      checklist: Array.isArray(template.task.checklist) ? template.task.checklist : task.checklist,
    }, `Applied template “${template.name}”`);
    closeOverflow();
  };

  const updateExistingTemplate = () => {
    const raw = window.localStorage.getItem(TASK_TEMPLATE_STORAGE_KEY);
    let templates: any[] = [];
    try { templates = raw ? JSON.parse(raw) : []; } catch { templates = []; }
    if (!Array.isArray(templates) || templates.length === 0) {
      window.alert("No saved task templates yet.");
      return;
    }
    const names = templates.map((item) => item.name).join("\n");
    const chosen = window.prompt(`Type the template name to update:\n\n${names}`)?.trim();
    if (!chosen) return;
    const index = templates.findIndex((item) => String(item.name).toLowerCase() === chosen.toLowerCase());
    if (index < 0) { window.alert("Template not found."); return; }
    templates[index] = {
      ...templates[index],
      updatedAt: new Date().toISOString(),
      task: {
        title: task.title, description: task.description, taskType: task.taskType,
        priority: task.priority, status: task.status, tags: task.tags,
        subtasks: task.subtasks, checklist: task.checklist,
      },
    };
    window.localStorage.setItem(TASK_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    window.alert("Template updated.");
    closeOverflow();
  };

  return (
    <>
      <button className="drawer-backdrop" aria-label="Close task" onClick={onClose} />
      <aside className="task-drawer task-drawer-no-cover" aria-label="Task details">
        <button className="task-drawer-close" onClick={onClose} aria-label="Close task" title="Close task">
          <X size={18} />
        </button>

        <div className="drawer-main drawer-main-no-cover">
          <div className="drawer-id-row">
            <span className="task-id-chip">{task.id.replace("task_", "RD-").slice(0, 9).toUpperCase()}</span>

            <div className="task-type-wrap">
              <button
                className="task-type-chip"
                aria-expanded={typeOpen}
                onClick={() => setTypeOpen((open) => !open)}
                title="Change task type"
              >
                <span className="task-type-chip-label">
                  <TaskTypeIcon type={task.taskType} size={14} />
                  {TASK_TYPE_META[task.taskType].label.toUpperCase()}
                </span>
                <ChevronDown size={14} className="task-type-chevron" />
              </button>

              {typeOpen && (
                <div className="task-type-popover">
                  <label className="task-type-search">
                    <Search size={16} />
                    <input
                      autoFocus
                      value={typeSearch}
                      onChange={(event) => setTypeSearch(event.target.value)}
                      placeholder="Find type (e.g. Milestone)"
                    />
                  </label>
                  <div className="task-type-heading">Task Types <span title="Choose how this item is categorized">?</span></div>
                  <div className="task-type-options">
                    {filteredTypes.map((type) => (
                      <button
                        key={type}
                        className={task.taskType === type ? "is-selected" : ""}
                        onClick={() => chooseType(type)}
                      >
                        <TaskTypeIcon type={type} />
                        <span>{TASK_TYPE_META[type].label}</span>
                        {type === "TASK" && <small>(default)</small>}
                        {task.taskType === type && <Check size={17} className="task-type-check" />}
                      </button>
                    ))}
                  </div>
                  <button className="fill-ai-button" onClick={fillTypeWithAI}>
                    <Sparkles size={16} /> Fill with AI
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="drawer-title-row drawer-title-row-functional">
            <input
              ref={titleRef}
              className="drawer-title-input"
              value={task.title}
              onChange={(event) => update({ title: event.target.value })}
            />

            <div className="task-icon-actions functional-task-actions">
              <ActionButton
                tooltip="Move to another list"
                onClick={() => setModal("move")}
              >
                <FolderInput size={19} />
              </ActionButton>

              <ActionButton
                tooltip={isWatching ? "Manage watchers" : "Watchers"}
                badge={task.watchers.length || undefined}
                onClick={() => setModal("watchers")}
              >
                <Bell size={19} />
              </ActionButton>

              <ActionButton tooltip="Share task" onClick={() => setModal("share")}>
                <Share2 size={19} />
              </ActionButton>

              <ActionButton
                tooltip={task.isPrivate ? "Make task public" : "Make task private"}
                active={task.isPrivate}
                onClick={() =>
                  update(
                    { isPrivate: !task.isPrivate },
                    task.isPrivate ? "Made task public" : "Made task private"
                  )
                }
              >
                {task.isPrivate ? <Lock size={19} /> : <Globe2 size={19} />}
              </ActionButton>

              <ActionButton
                tooltip={task.isFavorite ? "Remove from favorites" : "Add to favorites"}
                className={task.isFavorite ? "favorite-action is-favorite" : "favorite-action"}
                onClick={() =>
                  update(
                    { isFavorite: !task.isFavorite },
                    task.isFavorite ? "Removed from favorites" : "Added to favorites"
                  )
                }
              >
                <Star size={19} fill={task.isFavorite ? "currentColor" : "none"} />
              </ActionButton>

              {task.timerStartedAt && (
                <button
                  type="button"
                  className="timer-running-chip"
                  title="Timer is running. Click to stop."
                  onClick={stopTaskTimer}
                >
                  <Timer size={16} />
                  <span>{formatElapsedTimer(task.timerStartedAt, timerNow)}</span>
                </button>
              )}

              <button
                className="save-template-action"
                data-tooltip="Save this task as a reusable template"
                onClick={() => setModal("template")}
              >
                <Plus size={18} />
                <span>Save as template</span>
              </button>

              <div className="task-overflow-wrap">
                <ActionButton
                  tooltip="More task actions"
                  onClick={() => {
                    setOverflowOpen((open) => !open);
                    setOverflowSubmenu(null);
                  }}
                >
                  <MoreHorizontal size={20} />
                </ActionButton>

                {overflowOpen && (
                  <>
                    <button className="task-overflow-dismiss" aria-label="Close task menu" onClick={closeOverflow} />
                    <TaskOverflowMenu
                    task={task}
                    allTasks={allTasks}
                    isWatching={isWatching}
                    submenu={overflowSubmenu}
                    setSubmenu={setOverflowSubmenu}
                    update={update}
                    onClose={closeOverflow}
                    onRename={() => {
                      closeOverflow();
                      requestAnimationFrame(() => {
                        titleRef.current?.focus();
                        titleRef.current?.select();
                      });
                    }}
                    onMove={() => { closeOverflow(); setModal("move"); }}
                    onShare={() => { closeOverflow(); setModal("share"); }}
                    onDuplicate={() => { closeOverflow(); onDuplicate(); }}
                    onMergeTask={(otherTaskId) => { onMergeTask(otherTaskId); closeOverflow(); }}
                    onConvertToSubtask={(parentTaskId) => { onConvertToSubtask(parentTaskId); closeOverflow(); }}
                    onConvertToList={() => { onConvertToList(); closeOverflow(); }}
                    onDelete={() => {
                      if (!window.confirm("Delete this task?")) return;
                      closeOverflow();
                      onDelete();
                    }}
                    onArchive={() => {
                      update({ archived: true }, "Archived task");
                      closeOverflow();
                      onClose();
                    }}
                    onOpenTaskType={() => { closeOverflow(); setTypeOpen(true); }}
                    onOpenFields={() => { closeOverflow(); setTab("fields"); }}
                    onOpenRelationships={() => { closeOverflow(); setTab("dependencies"); }}
                    onOpenSaveTemplate={() => { closeOverflow(); setModal("template"); }}
                    onApplyTemplate={applyTemplate}
                    onUpdateTemplate={updateExistingTemplate}
                    onStartTimer={() => startTaskTimer("")}
                    onStopTimer={stopTaskTimer}
                    onCopyLink={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.set("task", task.id);
                      copyText(url.toString(), "Task link copied.");
                    }}
                    onCopyId={() => copyText(task.id, "Task ID copied.")}
                    onNewTab={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.set("task", task.id);
                      window.open(url.toString(), "_blank", "noopener,noreferrer");
                    }}
                    onReminder20={() => setReminderMinutes(20)}
                    onReminder120={() => setReminderMinutes(120)}
                    onReminderTomorrow={setReminderTomorrow}
                    onReminderNextWeek={setReminderNextWeek}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="drawer-badges-wrap">
            <div className="drawer-badges">
              {task.showStatusBadge && (
                <button
                  className={`pill status-pill system-badge-button status-pill-${task.status.toLowerCase().replaceAll("_", "-")}`}
                  style={{
                    color: statusMeta(task.status).color,
                    backgroundColor: `${statusMeta(task.status).color}18`,
                    borderColor: `${statusMeta(task.status).color}55`,
                  }}
                  onClick={() => {
                    setTagEditor(null);
                    setSystemBadgeEditor("status");
                  }}
                  title="Change or remove status badge"
                >
                  {statusMeta(task.status).label}
                </button>
              )}

              {task.showPriorityBadge && (
                <button
                  className={`pill priority-pill system-badge-button priority-text-${task.priority.toLowerCase()}`}
                  onClick={() => {
                    setTagEditor(null);
                    setSystemBadgeEditor("priority");
                  }}
                  title="Change or remove priority badge"
                >
                  {PRIORITY_META[task.priority].label}
                </button>
              )}

              {task.tags.map((tag, index) => {
                const theme = getTagTheme(tag);

                return (
                  <button
                    className="pill tag-pill tag-pill-editable"
                    key={`${tag}-${index}`}
                    onClick={() => { setSystemBadgeEditor(null); setTagEditor({ index, value: "" }); }}
                    title={`Change or remove tag ${tag}`}
                    style={{
                      backgroundColor: theme.background,
                      color: theme.color,
                      borderColor: theme.border,
                    }}
                  >
                    <span
                      className="tag-color-dot"
                      style={{ backgroundColor: theme.color }}
                    />
                    {tag}
                  </button>
                );
              })}

              <button
                className="add-tag-pill"
                onClick={() => { setSystemBadgeEditor(null); setTagEditor({ index: null, value: "" }); }}
                title="Add an existing or custom tag"
              >
                <span className="tag-outline-icon">◇</span> Add tag
              </button>
            </div>

            {systemBadgeEditor && (
              <div className="tag-editor-popover smart-tag-popover system-badge-popover">
                <div className="tag-editor-header">
                  <div>
                    <div className="tag-editor-title">
                      {systemBadgeEditor === "status" ? "Change status badge" : "Change priority badge"}
                    </div>
                    <div className="tag-editor-subtitle">
                      Pick another value or remove this badge from the task header.
                    </div>
                  </div>
                  <button
                    className="tag-popover-close"
                    onClick={() => setSystemBadgeEditor(null)}
                    aria-label="Close badge picker"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="current-tag-preview">
                  <span>Current</span>
                  {(() => {
                    const label = systemBadgeEditor === "status"
                      ? statusMeta(task.status).label
                      : PRIORITY_META[task.priority].label;
                    const theme = getTagTheme(label);
                    return (
                      <span
                        className="current-tag-chip"
                        style={{ backgroundColor: theme.background, color: theme.color, borderColor: theme.border }}
                      >
                        <span className="tag-color-dot" style={{ backgroundColor: theme.color }} />
                        {label}
                      </span>
                    );
                  })()}
                </div>

                <div className="tag-options-label">
                  {systemBadgeEditor === "status" ? "Status options" : "Priority options"}
                </div>

                <div className="tag-option-list">
                  {systemBadgeEditor === "status"
                    ? statusDefinitions.map((status) => {
                        const label = status.label;
                        return (
                          <button
                            key={status.id}
                            className="tag-option-row"
                            onClick={() => {
                              update({ status: status.id, showStatusBadge: true }, `Changed status to ${label}`);
                              setSystemBadgeEditor(null);
                            }}
                          >
                            <span className="tag-option-chip" style={{ backgroundColor: `${status.color}18`, color: status.color, borderColor: `${status.color}55` }}>
                              <span className="tag-color-dot" style={{ backgroundColor: status.color }} />
                              {label}
                            </span>
                            {task.status === status.id ? <Check size={14} /> : <ChevronRight size={14} />}
                          </button>
                        );
                      })
                    : (Object.keys(PRIORITY_META) as TaskPriority[]).map((priority) => {
                        const label = PRIORITY_META[priority].label;
                        const theme = getTagTheme(label);
                        return (
                          <button
                            key={priority}
                            className="tag-option-row"
                            onClick={() => {
                              update({ priority, showPriorityBadge: true }, `Changed priority to ${label}`);
                              setSystemBadgeEditor(null);
                            }}
                          >
                            <span className="tag-option-chip" style={{ backgroundColor: theme.background, color: theme.color, borderColor: theme.border }}>
                              <span className="tag-color-dot" style={{ backgroundColor: theme.color }} />
                              {label}
                            </span>
                            {task.priority === priority ? <Check size={14} /> : <ChevronRight size={14} />}
                          </button>
                        );
                      })}
                </div>

                <div className="tag-editor-actions">
                  <button
                    className="tag-delete-button"
                    onClick={() => {
                      if (systemBadgeEditor === "status") {
                        update({ showStatusBadge: false }, "Removed status badge from task header");
                      } else {
                        update({ showPriorityBadge: false }, "Removed priority badge from task header");
                      }
                      setSystemBadgeEditor(null);
                    }}
                  >
                    <Trash2 size={14} /> Remove from header
                  </button>
                </div>
              </div>
            )}

            {tagEditor && (
              <div className="tag-editor-popover smart-tag-popover">
                <div className="tag-editor-header">
                  <div>
                    <div className="tag-editor-title">
                      {tagEditor.index === null ? "Add tag" : "Change tag"}
                    </div>
                    <div className="tag-editor-subtitle">
                      Select an existing tag or create your own.
                    </div>
                  </div>

                  <button
                    className="tag-popover-close"
                    onClick={() => setTagEditor(null)}
                    aria-label="Close tag picker"
                  >
                    <X size={15} />
                  </button>
                </div>

                {tagEditor.index !== null && (
                  <div className="current-tag-preview">
                    <span>Current</span>
                    {(() => {
                      const currentTag = task.tags[tagEditor.index];
                      const theme = getTagTheme(currentTag);

                      return (
                        <span
                          className="current-tag-chip"
                          style={{
                            backgroundColor: theme.background,
                            color: theme.color,
                            borderColor: theme.border,
                          }}
                        >
                          <span
                            className="tag-color-dot"
                            style={{ backgroundColor: theme.color }}
                          />
                          {currentTag}
                        </span>
                      );
                    })()}
                  </div>
                )}

                <label className="tag-search-box">
                  <Search size={15} />
                  <input
                    autoFocus
                    value={tagEditor.value}
                    onChange={(event) =>
                      setTagEditor({ ...tagEditor, value: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && tagEditor.value.trim()) saveTag();
                      if (event.key === "Escape") setTagEditor(null);
                    }}
                    placeholder="Search existing tags..."
                  />
                </label>

                <div className="tag-options-label">Available tags</div>

                <div className="tag-option-list">
                  {existingTagOptions.length > 0 ? (
                    existingTagOptions.slice(0, 12).map((tag) => {
                      const theme = getTagTheme(tag);

                      return (
                        <button
                          key={tag}
                          className="tag-option-row"
                          onClick={() => selectExistingTag(tag)}
                        >
                          <span
                            className="tag-option-chip"
                            style={{
                              backgroundColor: theme.background,
                              color: theme.color,
                              borderColor: theme.border,
                            }}
                          >
                            <span
                              className="tag-color-dot"
                              style={{ backgroundColor: theme.color }}
                            />
                            {tag}
                          </span>

                          <Plus size={14} />
                        </button>
                      );
                    })
                  ) : (
                    <div className="tag-empty-state">No matching existing tags.</div>
                  )}
                </div>

                <div className="tag-editor-actions">
                  {tagEditor.index !== null && (
                    <button className="tag-delete-button" onClick={removeEditedTag}>
                      <Trash2 size={14} /> Remove
                    </button>
                  )}

                  {tagEditor.value.trim() && (
                    <button className="tag-save-button" onClick={saveTag}>
                      <Plus size={14} /> Create “{tagEditor.value.trim()}”
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="drawer-tabs">
            {tabs.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="drawer-scroll-content">
            {tab === "overview" && (
              <div className="drawer-section-stack">
                <section className="description-section rich-description-section">
                  <div className="section-title-line description-title-line">
                    <h3>Description</h3>
                    <div className="description-ai-top-actions" aria-label="Description AI actions">
                      <button
                        type="button"
                        data-tooltip="Improve description with AI"
                        aria-label="Improve description with AI"
                        onClick={improveDescription}
                      >
                        <Sparkles size={15} />
                        <span>Improve</span>
                      </button>
                      <button
                        type="button"
                        data-tooltip="Summarize this task with AI"
                        aria-label="Summarize this task with AI"
                        onClick={summarizeDescription}
                      >
                        <Sparkles size={15} />
                        <span>Summarize</span>
                      </button>
                    </div>
                  </div>

                  <div className="description-editor-shell">
                    <div className="description-toolbar" aria-label="Description formatting toolbar">
                      <button
                        type="button"
                        data-tooltip="Bold"
                        aria-label="Bold"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runDescriptionCommand("bold")}
                      >
                        <Bold size={15} />
                      </button>
                      <button
                        type="button"
                        data-tooltip="Italic"
                        aria-label="Italic"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runDescriptionCommand("italic")}
                      >
                        <Italic size={15} />
                      </button>
                      <button
                        type="button"
                        data-tooltip="Code"
                        aria-label="Code"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={formatDescriptionCode}
                      >
                        <Code2 size={15} />
                      </button>
                      <button
                        type="button"
                        data-tooltip="Link"
                        aria-label="Link"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={addDescriptionLink}
                      >
                        <Link2 size={15} />
                      </button>
                      <span className="description-toolbar-divider" />
                      <button
                        type="button"
                        data-tooltip="Heading 1"
                        aria-label="Heading 1"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runDescriptionCommand("formatBlock", "h1")}
                      >
                        <span className="description-heading-label">H1</span>
                      </button>
                      <button
                        type="button"
                        data-tooltip="Heading 2"
                        aria-label="Heading 2"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runDescriptionCommand("formatBlock", "h2")}
                      >
                        <span className="description-heading-label">H2</span>
                      </button>
                      <button
                        type="button"
                        data-tooltip="Bullet list"
                        aria-label="Bullet list"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runDescriptionCommand("insertUnorderedList")}
                      >
                        <ListIcon size={15} />
                      </button>
                      <button
                        type="button"
                        data-tooltip="Numbered list"
                        aria-label="Numbered list"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runDescriptionCommand("insertOrderedList")}
                      >
                        <ListOrdered size={15} />
                      </button>
                      <button
                        type="button"
                        data-tooltip="Quote"
                        aria-label="Quote"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runDescriptionCommand("formatBlock", "blockquote")}
                      >
                        <Quote size={15} />
                      </button>
                    </div>

                    <div
                      ref={descriptionRef}
                      className="description-rich-input"
                      contentEditable
                      suppressContentEditableWarning
                      role="textbox"
                      aria-multiline="true"
                      aria-label="Task description"
                      data-placeholder="Add a description..."
                      onKeyDown={handleDescriptionKeyDown}
                      onInput={() => {
                        // Keep the editor visually live. Persistence happens on blur and after toolbar actions.
                      }}
                      onBlur={() => persistDescriptionFromEditor("Updated task description")}
                      onPaste={(event) => {
                        event.preventDefault();
                        const text = event.clipboardData.getData("text/plain");
                        document.execCommand("insertText", false, text);
                      }}
                    />
                  </div>
                </section>
                <TaskFields task={task} update={update} watcherCandidates={safeWatcherCandidates} statusDefinitions={statusDefinitions} onCreateStatus={onCreateStatus} onRenameStatus={onRenameStatus} onDeleteStatus={onDeleteStatus} onOpenRecurrence={() => setModal("recurrence")} />
              </div>
            )}

            {tab === "fields" && (
              <section className="drawer-panel-section detail-tab-section">
                <div className="detail-section-heading">
                  <div>
                    <h3>Fields</h3>
                    <p>Project fields appear here for every task in this project.</p>
                  </div>
                  <button type="button" className="section-link-button" onClick={() => setCustomFieldComposerOpen((open) => !open)}>
                    <Plus size={15} /> Add field
                  </button>
                </div>

                {customFieldComposerOpen && (
                  <div className="custom-field-composer">
                    <input value={customFieldName} onChange={(event) => setCustomFieldName(event.target.value)} placeholder="Field name" autoFocus />
                    <select value={customFieldType} onChange={(event) => setCustomFieldType(event.target.value as CustomFieldType)}>
                      <option value="TEXT">Text</option>
                      <option value="NUMBER">Number</option>
                      <option value="DATE">Date</option>
                      <option value="CHECKBOX">Checkbox</option>
                    </select>
                    <button
                      type="button"
                      className="primary-button compact"
                      onClick={() => {
                        if (!customFieldName.trim()) return;
                        onCreateCustomField(customFieldName, customFieldType);
                        setCustomFieldName("");
                        setCustomFieldType("TEXT");
                        setCustomFieldComposerOpen(false);
                      }}
                    >
                      Add
                    </button>
                  </div>
                )}

                {customFieldDefinitions.length === 0 ? (
                  <div className="detail-empty-state">
                    <strong>No custom fields yet</strong>
                    <span>Add fields at the project level — they&apos;ll appear here for every task.</span>
                  </div>
                ) : (
                  <div className="custom-field-list">
                    {customFieldDefinitions.map((field) => (
                      <div className="custom-field-row" key={field.id}>
                        <div className="custom-field-label">
                          <span>{field.name}</span>
                          <div className="custom-field-actions">
                            <button
                              type="button"
                              title="Rename field"
                              onClick={() => {
                                const next = window.prompt("Rename field", field.name)?.trim();
                                if (next) onRenameCustomField(field.id, next);
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              title="Delete field"
                              onClick={() => {
                                if (window.confirm(`Delete field “${field.name}”?`)) onDeleteCustomField(field.id);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {field.type === "CHECKBOX" ? (
                          <label className="custom-checkbox-value">
                            <input
                              type="checkbox"
                              checked={task.customFieldValues[field.id] === "true"}
                              onChange={(event) => update({ customFieldValues: { ...task.customFieldValues, [field.id]: String(event.target.checked) } }, `Updated ${field.name}`)}
                            />
                            <span>{task.customFieldValues[field.id] === "true" ? "Yes" : "No"}</span>
                          </label>
                        ) : (
                          <input
                            type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                            value={task.customFieldValues[field.id] ?? ""}
                            onChange={(event) => update({ customFieldValues: { ...task.customFieldValues, [field.id]: event.target.value } })}
                            onBlur={() => task.customFieldValues[field.id] && update({}, `Updated ${field.name}`)}
                            placeholder={`Add ${field.name.toLowerCase()}...`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === "subtasks" && (
              <section className="drawer-panel-section detail-tab-section">
                {task.subtasks.length === 0 ? (
                  <div className="detail-empty-state">
                    <strong>No subtasks yet</strong>
                    <span>Break this task into smaller pieces.</span>
                  </div>
                ) : (
                  <div className="subtask-list detailed-list">
                    {task.subtasks.map((item) => (
                      <div className="check-row" key={item.id}>
                        <button
                          type="button"
                          title={item.done ? "Reopen subtask" : "Complete subtask"}
                          onClick={() =>
                            update(
                              {
                                subtasks: task.subtasks.map((subtask) =>
                                  subtask.id === item.id ? { ...subtask, done: !subtask.done } : subtask
                                ),
                              },
                              `${item.done ? "Reopened" : "Completed"} subtask “${item.title}”`
                            )
                          }
                        >
                          {item.done ? <CheckSquare size={19} /> : <SquareIcon />}
                        </button>
                        <span className={item.done ? "done" : ""}>{item.title}</span>
                        <button className="row-delete" title="Delete subtask" onClick={() => update({ subtasks: task.subtasks.filter((subtask) => subtask.id !== item.id) }, `Deleted subtask “${item.title}”`)}>
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <form className="detail-add-row" onSubmit={(event) => { event.preventDefault(); addSubtask(); }}>
                  <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="+ Add subtask" />
                  <button type="submit" disabled={!subtaskTitle.trim()}>Add</button>
                </form>
              </section>
            )}

            {tab === "checklists" && (
              <section className="drawer-panel-section detail-tab-section">
                {task.checklist.length === 0 ? (
                  <div className="detail-empty-state">
                    <strong>No checklists yet</strong>
                    <span>Add an item below to create one.</span>
                  </div>
                ) : (
                  <>
                    <div className="checklist-progress"><span style={{ width: `${task.checklist.length ? (task.checklist.filter((item) => item.done).length / task.checklist.length) * 100 : 0}%` }} /></div>
                    <div className="detailed-list">
                      {task.checklist.map((item) => {
                        const assigned = memberOptions.find((member) => member.id === item.assigneeId);
                        return (
                          <div className="check-row checklist-detail-row" key={item.id}>
                            <button type="button" onClick={() => update({ checklist: task.checklist.map((check) => check.id === item.id ? { ...check, done: !check.done } : check) }, `${item.done ? "Reopened" : "Completed"} checklist item “${item.title}”`)}>
                              {item.done ? <CheckSquare size={19} /> : <SquareIcon />}
                            </button>
                            <span className={item.done ? "done" : ""}>{item.title}</span>
                            <span className="checklist-assignee-label">{assigned ? assigned.name || assigned.email : "Unassigned"}</span>
                            <button className="row-delete" title="Delete checklist item" onClick={() => update({ checklist: task.checklist.filter((check) => check.id !== item.id) }, `Deleted checklist item “${item.title}”`)}><X size={15} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                <form className="checklist-add-row" onSubmit={(event) => { event.preventDefault(); addChecklistItem(); }}>
                  <input value={checkTitle} onChange={(event) => setCheckTitle(event.target.value)} placeholder="+ Add checklist item" />
                  <select value={checkAssigneeId} onChange={(event) => setCheckAssigneeId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {memberOptions.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}
                  </select>
                  <button type="submit" disabled={!checkTitle.trim()}>Add</button>
                </form>
              </section>
            )}

            {tab === "dependencies" && (
              <section className="drawer-panel-section detail-tab-section dependencies-panel">
                {(["BLOCKS", "BLOCKED_BY", "RELATED"] as TaskRelationshipKind[]).map((kind) => {
                  const heading = kind === "BLOCKS" ? "Blocking" : kind === "BLOCKED_BY" ? "Waiting on" : "Related";
                  const relationships = task.relationships.filter((relationship) => relationship.kind === kind);
                  return (
                    <div className="dependency-group" key={kind}>
                      <h4>{heading}</h4>
                      {relationships.length === 0 ? <p>None</p> : relationships.map((relationship) => {
                        const related = safeAllTasks.find((candidate) => candidate.id === relationship.taskId);
                        return (
                          <div className="dependency-row" key={relationship.id}>
                            <Link2 size={16} />
                            <span>{related?.title ?? relationship.taskId}</span>
                            <button type="button" title="Remove relationship" onClick={() => update({ relationships: task.relationships.filter((item) => item.id !== relationship.id) }, "Removed task relationship")}><X size={14} /></button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <div className="dependency-add detail-dependency-add">
                  <select value={dependencyKind} onChange={(event) => setDependencyKind(event.target.value as TaskRelationshipKind)}>
                    <option value="BLOCKS">Blocks</option>
                    <option value="BLOCKED_BY">Blocked by</option>
                    <option value="RELATED">Related</option>
                  </select>
                  <select value={dependencyId} onChange={(event) => setDependencyId(event.target.value)}>
                    <option value="">Choose related task...</option>
                    {dependencyTasks.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!dependencyId) return;
                      update({ relationships: [...task.relationships, { id: uid("relationship"), taskId: dependencyId, kind: dependencyKind }] }, "Added task relationship");
                      setDependencyId("");
                    }}
                    disabled={!dependencyId}
                  >
                    Add
                  </button>
                </div>
              </section>
            )}

            {tab === "attachments" && (
              <section className="drawer-panel-section detail-tab-section attachment-panel">
                <div
                  className={`attachment-drop-zone ${attachmentDragActive ? "is-dragging" : ""}`}
                  role="button"
                  tabIndex={0}
                  title="Drop files here or click to choose files"
                  onClick={() => attachmentInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      attachmentInputRef.current?.click();
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setAttachmentDragActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setAttachmentDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setAttachmentDragActive(false);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setAttachmentDragActive(false);
                    const files = Array.from(event.dataTransfer.files ?? []) as File[];
                    if (files.length) void uploadAttachments(files, "task");
                  }}
                >
                  <input
                    ref={attachmentInputRef}
                    className="attachment-drop-input"
                    type="file"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []) as File[];
                      if (files.length) void uploadAttachments(files, "task");
                      event.currentTarget.value = "";
                    }}
                  />
                  <Paperclip size={24} />
                  <span>{attachmentDragActive ? "Drop files to upload" : "Drag and drop files here to upload"}</span>
                  <small>or click to choose files</small>
                </div>

                <div className="attachment-upload-card">
                  <strong>Upload file</strong>
                  <div className="attachment-file-row">
                    <input type="file" multiple onChange={(event) => setAttachmentFiles(Array.from(event.target.files ?? []))} />
                    <button type="button" onClick={() => void uploadAttachments(attachmentFiles, "task")} disabled={attachmentFiles.length === 0}>Upload</button>
                  </div>
                  <strong>Attach by link</strong>
                  <div className="attachment-link-row">
                    <input value={attachmentLinkName} onChange={(event) => setAttachmentLinkName(event.target.value)} placeholder="File name (optional)" />
                    <input value={attachmentLinkUrl} onChange={(event) => setAttachmentLinkUrl(event.target.value)} placeholder="https://..." />
                    <button
                      type="button"
                      disabled={!attachmentLinkUrl.trim()}
                      onClick={() => {
                        const url = attachmentLinkUrl.trim();
                        if (!url) return;
                        const name = attachmentLinkName.trim() || (() => { try { return new URL(url).hostname; } catch { return "Linked attachment"; } })();
                        update({ attachments: [...task.attachments, { id: uid("attachment"), name, size: 0, kind: "LINK", url }] }, `Added linked attachment “${name}”`);
                        setAttachmentLinkName("");
                        setAttachmentLinkUrl("");
                      }}
                    >
                      Add attachment
                    </button>
                  </div>
                </div>

                {task.attachments.length === 0 ? (
                  <div className="detail-empty-state attachment-empty">
                    <strong>No files attached</strong>
                    <span>Drop files above to get started.</span>
                  </div>
                ) : (
                  <div className="attachment-list detailed-list">
                    {task.attachments.map((item) => (
                      <div className="attachment-item-row" key={item.id}>
                        <Paperclip size={16} />
                        <div><strong>{item.name}</strong><small>{item.kind === "LINK" ? "Linked attachment" : humanFileSize(item.size)}</small></div>
                        {(item.url || item.dataUrl) && <a href={item.url || item.dataUrl} target="_blank" rel="noreferrer" download={item.kind === "FILE" ? item.name : undefined}>Open</a>}
                        <button type="button" title="Remove attachment" onClick={() => update({ attachments: task.attachments.filter((file) => file.id !== item.id) }, `Removed attachment “${item.name}”`)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === "comments" && (
              <section className="drawer-panel-section detail-tab-section comments-panel">
                {task.comments.length === 0 ? (
                  <div className="detail-empty-state">
                    <strong>No comments yet</strong>
                    <span>Be the first to leave a note.</span>
                  </div>
                ) : (
                  <div className="comment-list detailed-comments">
                    {[...task.comments].reverse().map((item) => (
                      <article key={item.id}>
                        <span className="avatar-small">R</span>
                        <div>
                          <strong>Rundesk user</strong>
                          <small>{formatDateTime(item.createdAt)}</small>
                          {item.body && <p>{item.body}</p>}
                          {!!item.attachments?.length && (
                            <div className="comment-attachments">
                              {item.attachments.map((file) => <a key={file.id} href={file.url || file.dataUrl} target="_blank" rel="noreferrer" download={file.kind === "FILE" ? file.name : undefined}><Paperclip size={13} /> {file.name}</a>)}
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div
                  className={`comment-composer detailed-comment-composer ${commentDragActive ? "is-dragging" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setCommentDragActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setCommentDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setCommentDragActive(false);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setCommentDragActive(false);
                    const dropped = Array.from(event.dataTransfer.files ?? []) as File[];
                    if (dropped.length) setCommentFiles((current) => [...current, ...dropped]);
                  }}
                >
                  <div className="comment-input-wrap">
                    <textarea
                      ref={commentRef}
                      value={comment}
                      onChange={(event) => handleCommentChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                      onClick={(event) => handleCommentChange(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                      onKeyUp={(event) => {
                        if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
                        handleCommentChange(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
                      }}
                      onBlur={() => window.setTimeout(() => setCommentMentionOpen(false), 120)}
                      placeholder="Write a comment... use @ to mention"
                    />
                    {commentMentionOpen && (
                      <div className="comment-mention-menu">
                        <div className="comment-mention-label">Mention someone</div>
                        {mentionOptions.length ? mentionOptions.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertCommentMention(member)}
                          >
                            <span className="comment-mention-avatar">{(member.name || member.email || "?").slice(0, 1).toUpperCase()}</span>
                            <span>
                              <strong>{member.name || member.email}</strong>
                              {member.email && member.email !== member.name && <small>{member.email}</small>}
                            </span>
                          </button>
                        )) : (
                          <div className="comment-mention-empty">No matching members</div>
                        )}
                      </div>
                    )}
                    {commentDragActive && <div className="comment-drop-overlay"><Paperclip size={18} /> Drop files to attach</div>}
                  </div>

                  {!!commentFiles.length && (
                    <div className="pending-comment-files">
                      {commentFiles.map((file) => (
                        <span key={`${file.name}-${file.size}-${file.lastModified}`}>
                          <Paperclip size={12} />
                          {file.name}
                          <button type="button" title="Remove attachment" onClick={() => setCommentFiles((files) => files.filter((candidate) => candidate !== file))}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="comment-composer-actions">
                    <label className="attach-comment-button" title="Attach files to this comment">
                      <Paperclip size={17} />
                      Attach
                      <input
                        type="file"
                        multiple
                        onChange={(event) => {
                          const picked = Array.from(event.target.files ?? []) as File[];
                          if (picked.length) setCommentFiles((current) => [...current, ...picked]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button type="button" onClick={() => void addComment()} disabled={!comment.trim() && commentFiles.length === 0}>Comment</button>
                  </div>
                </div>
              </section>
            )}

            {tab === "activity" && (
              <section className="drawer-panel-section detail-tab-section activity-panel">
                {task.activity.length === 0 ? (
                  <div className="detail-empty-state">
                    <strong>No activity yet</strong>
                    <span>Changes will show up here.</span>
                  </div>
                ) : (
                  <div className="activity-list detailed-activity-list">
                    {task.activity.map((item) => (
                      <div key={item.id}>
                        <span className="activity-dot" />
                        <div><strong>{item.text}</strong><small>{formatDateTime(item.createdAt)}</small></div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === "time" && (
              <section className="drawer-panel-section detail-tab-section time-panel">
                <div className="timer-control-card">
                  <div className="timer-state">
                    <strong>{task.timerStartedAt ? formatElapsedTimer(task.timerStartedAt, timerNow) : "No timer running"}</strong>
                    {task.timerStartedAt && <small>{task.timerDescription || "Task work"}</small>}
                  </div>
                  <input
                    value={task.timerStartedAt ? task.timerDescription : timeDescription}
                    disabled={!!task.timerStartedAt}
                    onChange={(event) => setTimeDescription(event.target.value)}
                    placeholder="What are you working on?"
                  />
                  {task.timerStartedAt ? (
                    <button type="button" className="timer-stop-button" onClick={stopTaskTimer}>Stop timer</button>
                  ) : (
                    <button type="button" className="timer-start-button" onClick={() => { startTaskTimer(timeDescription); setTimeDescription(""); }}>Start timer</button>
                  )}
                </div>
                <div className="total-tracked-row"><span>Total tracked</span><strong>{totalTrackedSeconds ? formatTrackedSeconds(totalTrackedSeconds) : "—"}</strong></div>
                {task.timeEntries.length === 0 && !task.timerStartedAt ? (
                  <div className="detail-empty-state">
                    <strong>No time logged yet</strong>
                    <span>Start a timer to begin tracking.</span>
                  </div>
                ) : (
                  <div className="time-entry-list">
                    {task.timeEntries.map((entry) => (
                      <div className="time-entry-row" key={entry.id}>
                        <Timer size={16} />
                        <div><strong>{entry.description || "Task work"}</strong><small>{formatDateTime(entry.startedAt)} → {formatDateTime(entry.endedAt)}</small></div>
                        <span>{formatTrackedSeconds(entry.durationSeconds)}</span>
                        <button type="button" title="Delete time entry" onClick={() => update({ timeEntries: task.timeEntries.filter((item) => item.id !== entry.id) }, "Deleted time entry")}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </aside>

      {modal === "move" && (
        <MoveTaskModal
          taskTitle={task.title}
          destinations={moveDestinations}
          onMove={onMoveTask}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "watchers" && (
        <WatchersModal
          watchers={task.watchers}
          candidates={safeWatcherCandidates}
          onChange={(watchers, message) => update({ watchers }, message)}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "share" && (
        <TaskSharingModal
          task={task}
          onUpdate={update}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "template" && (
        <SaveTemplateModal task={task} onClose={() => setModal(null)} />
      )}

      {modal === "recurrence" && (
        <RecurrenceModal
          recurrence={task.recurrence}
          onSave={(recurrence) => {
            update({ recurrence }, recurrence ? `Set recurrence: ${recurrenceSummary(recurrence)}` : "Removed recurrence");
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}


function TaskOverflowMenu({
  task,
  allTasks,
  isWatching,
  submenu,
  setSubmenu,
  update,
  onClose,
  onRename,
  onMove,
  onShare,
  onDuplicate,
  onMergeTask,
  onConvertToSubtask,
  onConvertToList,
  onDelete,
  onArchive,
  onOpenTaskType,
  onOpenFields,
  onOpenRelationships,
  onOpenSaveTemplate,
  onApplyTemplate,
  onUpdateTemplate,
  onStartTimer,
  onStopTimer,
  onCopyLink,
  onCopyId,
  onNewTab,
  onReminder20,
  onReminder120,
  onReminderTomorrow,
  onReminderNextWeek,
}: {
  task: Task;
  allTasks: Task[];
  isWatching: boolean;
  submenu: "favorite" | "reminder" | "add" | "merge" | "convert" | "templates" | "relationships" | "tasktype" | null;
  setSubmenu: Dispatch<SetStateAction<"favorite" | "reminder" | "add" | "merge" | "convert" | "templates" | "relationships" | "tasktype" | null>>;
  update: (patch: Partial<Task>, activityText?: string) => void;
  onClose: () => void;
  onRename: () => void;
  onMove: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onMergeTask: (otherTaskId: string) => void;
  onConvertToSubtask: (parentTaskId: string) => void;
  onConvertToList: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onOpenTaskType: () => void;
  onOpenFields: () => void;
  onOpenRelationships: () => void;
  onOpenSaveTemplate: () => void;
  onApplyTemplate: () => void;
  onUpdateTemplate: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onCopyLink: () => void;
  onCopyId: () => void;
  onNewTab: () => void;
  onReminder20: () => void;
  onReminder120: () => void;
  onReminderTomorrow: () => void;
  onReminderNextWeek: () => void;
}) {
  const [menuTypeSearch, setMenuTypeSearch] = useState("");
  const [customReminderDate, setCustomReminderDate] = useState("");
  const [customReminderTime, setCustomReminderTime] = useState("09:00");
  const [relationshipKind, setRelationshipKind] = useState<TaskRelationshipKind>("RELATED");
  const safeAllTasks: Task[] = Array.isArray(allTasks) ? allTasks : [];

  const openSubmenu = (value: NonNullable<typeof submenu>) => {
    setSubmenu((current) => (current === value ? null : value));
  };

  const toggleWatching = () => {
    const selfWatcher: TaskWatcher = { id: "watcher_me", name: "You", email: "" };
    if (isWatching) {
      update({ watchers: task.watchers.filter((watcher) => watcher.id !== selfWatcher.id) }, "Stopped watching task");
    } else {
      update({ watchers: [...task.watchers, selfWatcher] }, "Started watching task");
    }
    onClose();
  };

  return (
    <div className="task-overflow-menu" role="menu">
      <div className="task-menu-top-actions">
        <button onClick={() => { onCopyLink(); onClose(); }}>Copy link</button>
        <button onClick={() => { onCopyId(); onClose(); }}>Copy ID</button>
        <button onClick={() => { onNewTab(); onClose(); }}>New tab</button>
      </div>

      <div className="task-menu-scroll">
        <MenuRow icon={<Star size={16} />} label="Favorite" hasSubmenu onClick={() => openSubmenu("favorite")} />
        <MenuRow icon={<Pencil size={16} />} label="Rename" onClick={onRename} />
        <MenuRow icon={<Bell size={16} />} label={isWatching ? "Unfollow task" : "Follow task"} onClick={toggleWatching} />
        <MenuRow icon={<AlarmClock size={16} />} label="Remind me in Inbox" hasSubmenu onClick={() => openSubmenu("reminder")} />

        <div className="task-menu-separator" />

        <MenuRow icon={<FolderInput size={16} />} label="Move to" onClick={onMove} />
        <MenuRow icon={<SlidersHorizontal size={16} />} label="Add to" hasSubmenu onClick={() => openSubmenu("add")} />
        <MenuRow icon={<Merge size={16} />} label="Merge" hasSubmenu onClick={() => openSubmenu("merge")} />
        <MenuRow icon={<CopyPlus size={16} />} label="Duplicate" onClick={onDuplicate} />
        <MenuRow icon={<Repeat2 size={16} />} label="Convert to" hasSubmenu onClick={() => openSubmenu("convert")} />
        <MenuRow icon={<SlidersHorizontal size={16} />} label="Custom Fields" onClick={onOpenFields} />
        <MenuRow icon={<Sparkles size={16} />} label="Templates" hasSubmenu onClick={() => openSubmenu("templates")} />

        <div className="task-menu-separator" />

        <MenuRow icon={<Link2 size={16} />} label="Relationships" hasSubmenu onClick={() => openSubmenu("relationships")} />
        <MenuRow icon={<Diamond size={16} />} label="Task Type" hasSubmenu onClick={() => openSubmenu("tasktype")} />

        <div className="task-menu-separator" />

        <MenuRow
          icon={<Timer size={16} />}
          label={task.timerStartedAt ? `Stop timer · ${formatElapsedTimer(task.timerStartedAt)}` : "Start timer"}
          onClick={() => {
            if (task.timerStartedAt) onStopTimer();
            else onStartTimer();
            onClose();
          }}
        />
        <MenuRow
          icon={<Mail size={16} />}
          label="Send email to task"
          onClick={() => {
            window.location.href = `mailto:?subject=${encodeURIComponent(task.title)}&body=${encodeURIComponent(`Task: ${task.title}\n${window.location.href}`)}`;
            onClose();
          }}
        />

        <div className="task-menu-separator" />

        <MenuRow icon={<Archive size={16} />} label="Archive" onClick={onArchive} />
        <MenuRow icon={<Trash2 size={16} />} label="Delete" danger onClick={onDelete} />
      </div>

      <button className="task-menu-share-button" onClick={onShare}>Sharing &amp; Permissions</button>

      {submenu === "favorite" && (
        <div className="task-menu-submenu task-favorite-submenu">
          <div className="favorite-layout-grid">
            {([
              ["SIDEBAR", "Sidebar"],
              ["TOP", "Top"],
              ["BOTTOM", "Bottom"],
            ] as const).map(([placement, label]) => (
              <button
                key={placement}
                className={task.favoritePlacement === placement ? "is-selected" : ""}
                onClick={() => {
                  update({ isFavorite: true, favoritePlacement: placement }, `Added task to favorites (${label})`);
                  onClose();
                }}
              >
                <span className={`favorite-layout-preview preview-${placement.toLowerCase()}`} />
                <strong>{label}</strong>
              </button>
            ))}
          </div>
          <div className="favorite-section-title"><span>Sections</span><Plus size={15} /></div>
          <button
            className="favorite-section-row"
            onClick={() => {
              update({ isFavorite: !task.isFavorite, favoritePlacement: task.isFavorite ? null : "SIDEBAR" }, task.isFavorite ? "Removed from favorites" : "Added to favorites");
              onClose();
            }}
          >
            <Star size={15} fill={task.isFavorite ? "currentColor" : "none"} />
            Favorites
            {task.isFavorite && <Check size={15} />}
          </button>
        </div>
      )}

      {submenu === "reminder" && (
        <div className="task-menu-submenu task-reminder-submenu">
          <div className="custom-reminder-block">
            <div className="custom-reminder-heading">
              <strong>Custom reminder</strong>
              <span>Choose your exact date and time</span>
            </div>

            <div className="custom-reminder-fields">
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={customReminderDate}
                  onChange={(event) => setCustomReminderDate(event.target.value)}
                  aria-label="Custom reminder date"
                />
              </label>

              <label>
                <span>Time</span>
                <input
                  type="time"
                  value={customReminderTime}
                  onChange={(event) => setCustomReminderTime(event.target.value)}
                  aria-label="Custom reminder time"
                />
              </label>

              <button
                className="custom-reminder-set"
                type="button"
                disabled={!customReminderDate || !customReminderTime}
                onClick={() => {
                  if (!customReminderDate || !customReminderTime) return;
                  const selected = new Date(`${customReminderDate}T${customReminderTime}`);
                  if (Number.isNaN(selected.getTime())) {
                    window.alert("Please choose a valid date and time.");
                    return;
                  }
                  update(
                    { reminderAt: selected.toISOString() },
                    `Added Inbox reminder for ${selected.toLocaleString()}`
                  );
                  onClose();
                }}
              >
                Set
              </button>
            </div>
          </div>
          <div className="reminder-preset-label">Quick reminders</div>
          <button onClick={onReminder20}><span>◴</span><strong>In 20 minutes</strong><small>20 min</small></button>
          <button onClick={onReminder120}><span>◷</span><strong>In 2 hours</strong><small>2 hrs</small></button>
          <button onClick={onReminderTomorrow}><span>☀</span><strong>Tomorrow</strong><small>8:00 AM</small></button>
          <button onClick={onReminderNextWeek}><span>▣</span><strong>Next week</strong><small>Mon, 8:00 AM</small></button>
          {task.reminderAt && (
            <div className="current-reminder current-reminder-with-clear">
              <span>Current: {formatDateTime(task.reminderAt)}</span>
              <button
                type="button"
                onClick={() => {
                  update({ reminderAt: "" }, "Removed Inbox reminder");
                  onClose();
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {submenu === "add" && (
        <div className="task-menu-submenu task-simple-submenu">
          <button onClick={onMove}><FolderInput size={16} /> Another List</button>
          <button onClick={() => { update({ personalList: !task.personalList }, task.personalList ? "Removed from Personal List" : "Added to Personal List"); onClose(); }}>
            <ListPlusIcon /> Personal List {task.personalList && <Check size={15} />}
          </button>
          <div className="submenu-label">Add to Personal Priorities</div>
          <button onClick={() => { update({ personalPriority: !task.personalPriority }, task.personalPriority ? "Removed from Personal Priorities" : "Added to Personal Priorities"); onClose(); }}>
            <UserPlus size={16} /> Personal priorities {task.personalPriority && <Check size={15} />}
          </button>
        </div>
      )}

      {submenu === "merge" && (
        <div className="task-menu-submenu task-simple-submenu task-merge-submenu">
          <div className="submenu-label">Merge another task into this task</div>
          {safeAllTasks.filter((candidate: Task) => candidate.id !== task.id && !candidate.archived).length === 0 ? (
            <div className="task-menu-empty">No other tasks are available in this folder.</div>
          ) : (
            safeAllTasks
              .filter((candidate: Task) => candidate.id !== task.id && !candidate.archived)
              .map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => {
                    if (!window.confirm(`Merge “${candidate.title}” into “${task.title}”? The other task will be removed.`)) return;
                    onMergeTask(candidate.id);
                  }}
                >
                  <Merge size={15} />
                  <span>{candidate.title}</span>
                </button>
              ))
          )}
        </div>
      )}

      {submenu === "convert" && (
        <div className="task-menu-submenu task-simple-submenu compact-submenu task-convert-submenu">
          <button
            onClick={() => {
              if (!window.confirm(`Convert “${task.title}” into a new list? The original task will be removed.`)) return;
              onConvertToList();
            }}
          >
            <Repeat2 size={16} /> Convert to list
          </button>

          <div className="submenu-label">Convert to subtask of</div>
          {safeAllTasks.filter((candidate: Task) => candidate.id !== task.id && !candidate.archived).length === 0 ? (
            <div className="task-menu-empty">No other task is available as a parent.</div>
          ) : (
            safeAllTasks
              .filter((candidate: Task) => candidate.id !== task.id && !candidate.archived)
              .map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => {
                    if (!window.confirm(`Convert “${task.title}” to a subtask of “${candidate.title}”?`)) return;
                    onConvertToSubtask(candidate.id);
                  }}
                >
                  <Repeat2 size={15} />
                  <span>{candidate.title}</span>
                </button>
              ))
          )}
        </div>
      )}

      {submenu === "templates" && (
        <div className="task-menu-submenu task-simple-submenu">
          <button onClick={onApplyTemplate}><ClipboardList size={16} /> Apply a template</button>
          <button onClick={onOpenSaveTemplate}><FileText size={16} /> Save as template</button>
          <button onClick={onUpdateTemplate}><Repeat2 size={16} /> Update existing template</button>
        </div>
      )}

      {submenu === "relationships" && (
        <div className="task-menu-submenu task-simple-submenu relationships-submenu functional-relationships-submenu">
          <div className="submenu-label">Relationship type</div>
          {([
            ["RELATED", "Related task"],
            ["BLOCKS", "This task blocks"],
            ["BLOCKED_BY", "This task is blocked by"],
          ] as const).map(([kind, label]) => (
            <button
              key={kind}
              className={relationshipKind === kind ? "is-selected" : ""}
              onClick={() => setRelationshipKind(kind)}
            >
              {kind === "RELATED" ? <Link2 size={15} /> : (
                <span className={`relationship-dot ${kind === "BLOCKS" ? "block-dot" : "blocked-dot"}`}>
                  {kind === "BLOCKS" ? "−" : "!"}
                </span>
              )}
              <span>{label}</span>
              {relationshipKind === kind && <Check size={14} />}
            </button>
          ))}

          <div className="task-menu-separator" />
          <div className="submenu-label">Choose a task</div>

          {safeAllTasks.filter((candidate: Task) => candidate.id !== task.id && !candidate.archived).length === 0 ? (
            <div className="task-menu-empty">No other tasks are available.</div>
          ) : (
            safeAllTasks
              .filter((candidate: Task) => candidate.id !== task.id && !candidate.archived)
              .map((candidate) => {
                const existing = task.relationships.find(
                  (relationship) =>
                    relationship.taskId === candidate.id &&
                    relationship.kind === relationshipKind
                );

                return (
                  <button
                    key={candidate.id}
                    className={existing ? "is-selected" : ""}
                    onClick={() => {
                      if (existing) {
                        update(
                          { relationships: task.relationships.filter((relationship) => relationship.id !== existing.id) },
                          `Removed relationship with “${candidate.title}”`
                        );
                      } else {
                        update(
                          {
                            relationships: [
                              ...task.relationships,
                              {
                                id: uid("relationship"),
                                taskId: candidate.id,
                                kind: relationshipKind,
                              },
                            ],
                          },
                          `Added relationship with “${candidate.title}”`
                        );
                      }
                    }}
                  >
                    <Link2 size={15} />
                    <span>{candidate.title}</span>
                    {existing ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                );
              })
          )}

          <div className="task-menu-separator" />
          <button onClick={onOpenRelationships}>
            <ExternalLink size={15} /> Open dependencies view
          </button>
        </div>
      )}

      {submenu === "tasktype" && (
        <div className="task-menu-submenu overflow-task-type-submenu">
          <label className="overflow-task-type-search">
            <Search size={15} />
            <input value={menuTypeSearch} onChange={(event) => setMenuTypeSearch(event.target.value)} placeholder="Find type (e.g. Milestone)" />
          </label>
          <div className="submenu-label">Task Types</div>
          <div className="overflow-task-type-list">
            {taskTypes
              .filter((type) => TASK_TYPE_META[type].label.toLowerCase().includes(menuTypeSearch.trim().toLowerCase()))
              .map((type) => (
                <button
                  key={type}
                  className={task.taskType === type ? "is-selected" : ""}
                  onClick={() => {
                    update({ taskType: type }, `Changed task type to ${TASK_TYPE_META[type].label}`);
                    onClose();
                  }}
                >
                  <TaskTypeIcon type={type} size={15} />
                  <span>{TASK_TYPE_META[type].label}</span>
                  {task.taskType === type && <Check size={15} />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  hasSubmenu = false,
  danger = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hasSubmenu?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`task-menu-row ${danger ? "is-danger" : ""}`} onClick={onClick} role="menuitem">
      <span className="task-menu-row-icon">{icon}</span>
      <span>{label}</span>
      {hasSubmenu && <ChevronRight size={15} className="task-menu-chevron" />}
    </button>
  );
}

function ListPlusIcon() {
  return <span style={{ fontSize: 16, lineHeight: 1 }}>☷</span>;
}

function TaskSharingModal({
  task,
  onUpdate,
  onClose,
}: {
  task: Task;
  onUpdate: (patch: Partial<Task>, activityText?: string) => void;
  onClose: () => void;
}) {
  const [invite, setInvite] = useState("");

  const copyPrivateLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      window.alert("Private task link copied.");
    } catch {
      window.prompt("Copy this task link:", window.location.href);
    }
  };

  const invitePerson = () => {
    const value = invite.trim();
    if (!value) return;
    const email = value.includes("@") ? value.toLowerCase() : `${value.toLowerCase().replace(/\s+/g, ".")}@invite.local`;
    if (!task.permissions.some((permission) => permission.email.toLowerCase() === email)) {
      const permission: SharePermission = { id: uid("permission"), email, role: "VIEW_ONLY" };
      onUpdate({ permissions: [...task.permissions, permission] }, `Shared task with ${value}`);
    }
    setInvite("");
  };

  return (
    <>
      <button className="entity-modal-backdrop" aria-label="Close" onClick={onClose} />
      <section className="entity-modal task-sharing-modal" role="dialog" aria-modal="true">
        <div className="entity-modal-title">
          <h2>Share this task</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>

        <div className="task-sharing-subtitle">Sharing task <span className="sharing-task-dot" /> <strong>{task.title}</strong></div>

        <div className="task-sharing-invite">
          <input
            autoFocus
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && invitePerson()}
            placeholder="Invite by name or email"
          />
          <button onClick={invitePerson}>Invite</button>
        </div>

        <div className="task-sharing-row">
          <span className="sharing-row-icon"><Globe2 size={17} /></span>
          <div><strong>Share link with anyone</strong><small>Anyone with the link can open this task.</small></div>
          <Toggle checked={task.shareLinkEnabled} onChange={() => onUpdate({ shareLinkEnabled: !task.shareLinkEnabled }, task.shareLinkEnabled ? "Disabled public task link" : "Enabled public task link")} />
        </div>

        <div className="task-sharing-row">
          <span className="sharing-row-icon"><Link2 size={17} /></span>
          <div><strong>Private link</strong><small>Only people with access can open it.</small></div>
          <button className="copy-private-link" onClick={copyPrivateLink}>Copy link</button>
        </div>

        <div className="task-share-with-title">Share with</div>
        <div className="task-sharing-row task-share-list-row">
          <span className="sharing-disclosure">›</span>
          <div><strong>List</strong><small>Keep task access synced with its list.</small></div>
          <Toggle checked={task.shareWithList} onChange={() => onUpdate({ shareWithList: !task.shareWithList }, "Updated list sharing")} />
        </div>

        {task.permissions.length > 0 && (
          <div className="task-invited-people">
            {task.permissions.map((permission) => (
              <div key={permission.id}>
                <span className="shared-avatar">{permission.email.charAt(0).toUpperCase()}</span>
                <span>{permission.email}</span>
                <button onClick={() => onUpdate({ permissions: task.permissions.filter((item) => item.id !== permission.id) }, "Removed task sharing")}>Remove</button>
              </div>
            ))}
          </div>
        )}

        <button
          className="task-make-private"
          onClick={() => onUpdate({ isPrivate: !task.isPrivate }, task.isPrivate ? "Made task public" : "Made task private")}
        >
          <Lock size={16} /> {task.isPrivate ? "Make Public" : "Make Private"}
        </button>
      </section>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button className={`compact-toggle ${checked ? "is-on" : ""}`} onClick={onChange} aria-pressed={checked}>
      <span />
    </button>
  );
}

function ActionButton({
  tooltip,
  badge,
  active = false,
  className = "",
  onClick,
  children,
}: {
  tooltip: string;
  badge?: number;
  active?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`task-action-with-tooltip ${active ? "is-active" : ""} ${className}`}
      data-tooltip={tooltip}
      aria-label={tooltip}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="task-action-badge">{badge}</span> : null}
    </button>
  );
}

function toLocalDateTimeInput(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00`;
  return value.slice(0, 16);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocal(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function quickDueDate(kind: "today" | "tomorrow" | "weekend" | "nextweek" | "2weeks" | "4weeks") {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setHours(17, 0, 0, 0);
  if (kind === "tomorrow") date.setDate(date.getDate() + 1);
  if (kind === "weekend") {
    const day = date.getDay();
    const delta = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
    date.setDate(date.getDate() + delta);
    date.setHours(10, 0, 0, 0);
  }
  if (kind === "nextweek") {
    const day = date.getDay();
    const delta = ((8 - day) % 7) || 7;
    date.setDate(date.getDate() + delta);
    date.setHours(9, 0, 0, 0);
  }
  if (kind === "2weeks") date.setDate(date.getDate() + 14);
  if (kind === "4weeks") date.setDate(date.getDate() + 28);
  return toDateTimeLocal(date);
}

function recurrenceSummary(recurrence: TaskRecurrence | null) {
  if (!recurrence) return "Doesn’t repeat";
  const interval = Math.max(1, recurrence.interval || 1);
  if (recurrence.frequency === "DAILY") {
    if (recurrence.skipWeekends && interval === 1) return "Every weekday";
    return interval === 1 ? "Every day" : `Every ${interval} days${recurrence.skipWeekends ? ", skipping weekends" : ""}`;
  }
  if (recurrence.frequency === "WEEKLY") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selected = recurrence.weekdays.map((day) => names[day]).filter(Boolean).join(", ");
    const base = interval === 1 ? "Every week" : `Every ${interval} weeks`;
    return selected ? `${base} on ${selected}` : base;
  }
  return interval === 1 ? "Every month" : `Every ${interval} months`;
}

function TaskFields({
  task,
  update,
  expanded = false,
  watcherCandidates,
  statusDefinitions,
  onCreateStatus,
  onRenameStatus,
  onDeleteStatus,
  onOpenRecurrence,
}: {
  task: Task;
  update: (patch: Partial<Task>, activityText?: string) => void;
  expanded?: boolean;
  watcherCandidates: WatcherCandidate[];
  statusDefinitions: StatusDefinition[];
  onCreateStatus: (label: string, color: string) => void;
  onRenameStatus: (statusId: string, label: string, color: string) => void;
  onDeleteStatus: (statusId: string) => void;
  onOpenRecurrence: () => void;
}) {
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#3b82f6");
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingStatusLabel, setEditingStatusLabel] = useState("");
  const [editingStatusColor, setEditingStatusColor] = useState("#667085");
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [docFormOpen, setDocFormOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [workUrl, setWorkUrl] = useState("");
  const assigneeSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!assigneePickerOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && !assigneeSectionRef.current?.contains(target)) {
        setAssigneePickerOpen(false);
        setMemberQuery("");
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssigneePickerOpen(false);
        setMemberQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [assigneePickerOpen]);

  const currentStatus = statusDefinitions.find((status) => status.id === task.status) ?? statusDefinitions[0];

  const suggestPriority = () => {
    const plainDescription = task.description
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ");
    const source = `${task.title} ${plainDescription} ${task.tags.join(" ")}`.toLowerCase();

    let suggested: TaskPriority = "NORMAL";
    if (/\b(urgent|critical|asap|blocker|blocked|production down|immediately|emergency)\b/.test(source)) suggested = "URGENT";
    else if (/\b(high|important|deadline|priority|soon|today|tomorrow)\b/.test(source)) suggested = "HIGH";
    else if (/\b(low|minor|optional|nice to have|someday|later)\b/.test(source)) suggested = "LOW";

    if (task.dueDate) {
      const due = new Date(task.dueDate).getTime();
      if (!Number.isNaN(due)) {
        const days = Math.ceil((due - Date.now()) / 86_400_000);
        if (days <= 1) suggested = "URGENT";
        else if (days <= 3 && suggested !== "URGENT") suggested = "HIGH";
      }
    }

    update({ priority: suggested }, `Smart priority suggestion: ${PRIORITY_META[suggested].label}`);
  };

  const suggestDueDate = () => {
    const base = task.startDate ? new Date(task.startDate) : new Date();
    const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
    const offsets: Record<TaskPriority, number> = { URGENT: 1, HIGH: 3, NORMAL: 7, LOW: 14 };
    safeBase.setDate(safeBase.getDate() + offsets[task.priority]);

    // Keep suggested deadlines on a weekday and at a practical end-of-day time.
    if (safeBase.getDay() === 6) safeBase.setDate(safeBase.getDate() + 2);
    if (safeBase.getDay() === 0) safeBase.setDate(safeBase.getDate() + 1);
    safeBase.setHours(17, 0, 0, 0);

    const suggested = toDateTimeLocal(safeBase);
    update({ dueDate: suggested }, `AI suggested due date: ${safeBase.toLocaleString()}`);
  };

  const normalizeExternalUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.toString();
    } catch {
      return "";
    }
  };

  const memberKey = (member: { name: string; email: string }) =>
    (member.email || member.name).trim().toLowerCase();

  const assignMember = (member: { id?: string; name: string; email: string }) => {
    const key = memberKey(member);
    if (!key) return;
    if (task.assignees.some((item) => memberKey(item) === key)) return;
    const next = [
      ...task.assignees,
      { id: member.id || uid("assignee"), name: member.name.trim() || member.email.trim(), email: member.email.trim() },
    ];
    update(
      { assignees: next, assignee: next[0]?.name || next[0]?.email || "" },
      `Assigned ${member.name || member.email}`
    );
    setMemberQuery("");
    setAssigneePickerOpen(false);
  };

  const unassignMember = (id: string) => {
    const removed = task.assignees.find((item) => item.id === id);
    const next = task.assignees.filter((item) => item.id !== id);
    update(
      { assignees: next, assignee: next[0]?.name || next[0]?.email || "" },
      removed ? `Unassigned ${removed.name || removed.email}` : "Updated assignees"
    );
    setAssigneePickerOpen(false);
    setMemberQuery("");
  };

  const availableMembers = watcherCandidates.filter((candidate) => {
    const query = memberQuery.trim().toLowerCase();
    const alreadyAssigned = task.assignees.some((item) => memberKey(item) === memberKey(candidate));
    if (alreadyAssigned) return false;
    if (!query) return true;
    return `${candidate.name} ${candidate.email}`.toLowerCase().includes(query);
  });

  const addCustomMember = () => {
    const value = memberQuery.trim();
    if (!value) return;
    const email = value.includes("@") ? value : "";
    assignMember({ name: email ? value.split("@")[0] : value, email });
  };

  const addLinkedDoc = () => {
    const url = normalizeExternalUrl(docUrl);
    const title = docTitle.trim();
    if (!url || !title) return;
    update(
      { linkedDocs: [...task.linkedDocs, { id: uid("doc"), title, url }] },
      `Linked document “${title}”`
    );
    setDocTitle("");
    setDocUrl("");
    setDocFormOpen(false);
  };

  const detectWorkType = (url: string) => {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("github.com")) return { type: "GITHUB" as const, label: "GitHub" };
    if (host.includes("gitlab.com")) return { type: "GITLAB" as const, label: "GitLab" };
    if (host.includes("drive.google.com") || host.includes("docs.google.com")) return { type: "DRIVE" as const, label: "Google Drive" };
    if (host.includes("dropbox.com")) return { type: "DROPBOX" as const, label: "Dropbox" };
    if (host.includes("zoom.us")) return { type: "ZOOM" as const, label: "Zoom meeting" };
    if (host.includes("meet.google.com")) return { type: "GOOGLE_MEET" as const, label: "Google Meet" };
    return { type: "OTHER" as const, label: host.replace(/^www\./, "") || "Linked work" };
  };

  const addLinkedWork = () => {
    const url = normalizeExternalUrl(workUrl);
    if (!url) return;
    const meta = detectWorkType(url);
    update(
      { linkedWork: [...task.linkedWork, { id: uid("work"), url, ...meta }] },
      `Linked ${meta.label}`
    );
    setWorkUrl("");
  };

  return (
    <section className={`fields-grid ${expanded ? "fields-grid-expanded" : ""}`}>
      <Field label="Status">
        <div className="status-field-wrap">
          <button type="button" className="status-select-button" onClick={() => setStatusManagerOpen((open) => !open)} title="Change or manage statuses">
            <span className="status-select-value"><span className="status-dot" style={{ background: currentStatus?.color ?? "#667085" }} />{currentStatus?.label ?? task.status}</span>
            <ChevronDown size={17} />
          </button>

          {statusManagerOpen && (
            <div className="status-manager-popover">
              <div className="status-manager-header">
                <div><strong>Statuses</strong><span>Create, rename, recolor, or delete statuses.</span></div>
                <button type="button" className="icon-button" onClick={() => setStatusManagerOpen(false)} title="Close status manager"><X size={16} /></button>
              </div>
              <div className="status-manager-list">
                {statusDefinitions.map((status) => (
                  <div className={`status-manager-row ${task.status === status.id ? "is-current" : ""} ${editingStatusId === status.id ? "is-editing" : ""}`} key={status.id}>
                    {editingStatusId === status.id ? (
                      <>
                        <input className="status-manager-name-input" value={editingStatusLabel} onChange={(event) => setEditingStatusLabel(event.target.value)} autoFocus />
                        <input className="status-manager-color-input" type="color" value={editingStatusColor} onChange={(event) => setEditingStatusColor(event.target.value)} title="Choose status color" />
                        <button type="button" className="status-manager-save" onClick={() => { const label = editingStatusLabel.trim(); if (!label) return; onRenameStatus(status.id, label, editingStatusColor); setEditingStatusId(null); }} title="Save status changes"><Check size={15} /></button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="status-manager-pick" onClick={() => { update({ status: status.id }, `Changed status to ${status.label}`); setStatusManagerOpen(false); }} title={`Set status to ${status.label}`}>
                          <span className="status-dot" style={{ background: status.color }} /><span>{status.label}</span>{task.status === status.id && <Check size={15} />}
                        </button>
                        <button type="button" className="status-manager-icon" onClick={() => { setEditingStatusId(status.id); setEditingStatusLabel(status.label); setEditingStatusColor(status.color); }} title={`Edit ${status.label}`}><Pencil size={14} /></button>
                        <button type="button" className="status-manager-icon danger" onClick={() => onDeleteStatus(status.id)} disabled={statusDefinitions.length <= 1} title={statusDefinitions.length <= 1 ? "At least one status is required" : `Delete ${status.label}`}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="status-manager-create">
                <input value={newStatusLabel} onChange={(event) => setNewStatusLabel(event.target.value)} placeholder="New status name" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const label = newStatusLabel.trim(); if (!label) return; onCreateStatus(label, newStatusColor); setNewStatusLabel(""); } }} />
                <input type="color" value={newStatusColor} onChange={(event) => setNewStatusColor(event.target.value)} title="Choose new status color" />
                <button type="button" className="primary-button compact" onClick={() => { const label = newStatusLabel.trim(); if (!label) return; onCreateStatus(label, newStatusColor); setNewStatusLabel(""); }}><Plus size={14} /> Add</button>
              </div>
            </div>
          )}
        </div>
      </Field>

      <Field label="Priority">
        <div className="priority-ai-control">
          <select value={task.priority} className={`priority-select priority-text-${task.priority.toLowerCase()}`} onChange={(event) => { const value = event.target.value as TaskPriority; update({ priority: value }, `Changed priority to ${PRIORITY_META[value].label}`); }}>
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((priority) => <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>)}
          </select>
          <button type="button" className="priority-ai-button" onClick={suggestPriority} data-tooltip="Suggest priority from task details" aria-label="Suggest priority from task details" title="Suggest priority from task details"><Sparkles size={17} /><span className="priority-ai-label">AI</span></button>
        </div>
      </Field>

      <div className="field-control due-date-field">
        <div className="field-label-row">
          <span>Due date</span>
          <button
            type="button"
            className="due-date-ai-action"
            onClick={suggestDueDate}
            data-tooltip="Suggest a due date with AI"
            aria-label="Suggest a due date with AI"
            title="Suggest a due date with AI"
          >
            <Sparkles size={13} />
            <span>AI</span>
          </button>
        </div>
        <input type="datetime-local" value={toLocalDateTimeInput(task.dueDate)} onChange={(event) => update({ dueDate: event.target.value }, event.target.value ? "Updated due date" : "Removed due date")} />
        <div className="date-recurrence-actions">
          <button
            type="button"
            className="set-recurring-chip"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenRecurrence();
            }}
            title="Set custom recurrence"
          >
            <Repeat2 size={13} />
            Set Recurring
          </button>
          {task.recurrence && <span className="recurrence-inline-summary">{recurrenceSummary(task.recurrence)}</span>}
        </div>
      </div>

      <Field label="Start date">
        <input type="datetime-local" value={toLocalDateTimeInput(task.startDate)} onChange={(event) => update({ startDate: event.target.value }, event.target.value ? "Updated start date" : "Removed start date")} />
      </Field>

      <Field label="Estimate (hrs)">
        <input
          className="estimate-hours-input"
          type="number"
          min="0"
          step="0.5"
          value={task.estimate}
          onChange={(event) => update({ estimate: event.target.value })}
          placeholder="—"
          aria-label="Estimate in hours"
        />
      </Field>

      <div className="field-grid-spacer" aria-hidden="true" />

      <div className="task-assignees-section task-fields-full" ref={assigneeSectionRef}>
        <div className="section-inline-heading assignee-heading">
          <div className="assignee-title-copy">
            <span>Assignees</span>
            <small>People responsible for this task</small>
          </div>
        </div>

        {task.assignees.length > 0 ? (
          <div className="assigned-member-list assignee-member-grid">
            {task.assignees.map((member) => (
              <div className="assigned-member-chip assignee-person-card" key={member.id} title={member.email || member.name}>
                <span className="member-avatar">{(member.name || member.email).slice(0, 1).toUpperCase()}</span>
                <span className="assignee-person-copy">
                  <strong>{member.name || member.email}</strong>
                  {member.email && member.email !== member.name && <small>{member.email}</small>}
                </span>
                <button type="button" onClick={() => unassignMember(member.id)} title={`Unassign ${member.name || member.email}`} aria-label={`Unassign ${member.name || member.email}`}><X size={13} /></button>
              </div>
            ))}
            <button
              type="button"
              className="assignee-add-person-card"
              onClick={() => setAssigneePickerOpen((open) => !open)}
              title="Add another assignee"
            >
              <span className="assignee-add-person-icon"><Plus size={16} /></span>
              <span>Add person</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="assignee-empty-card"
            onClick={() => setAssigneePickerOpen(true)}
            title="Assign people to this task"
          >
            <span className="assignee-empty-icon"><UserPlus size={18} /></span>
            <span className="assignee-empty-copy">
              <strong>Add assignees</strong>
              <small>Choose a workspace member or add someone by name/email</small>
            </span>
            <ChevronRight size={16} />
          </button>
        )}

        {assigneePickerOpen && (
          <div className="assignee-picker">
            <div className="assignee-picker-search">
              <Search size={15} />
              <input
                autoFocus
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomMember(); } }}
                placeholder="Search or add member by name/email..."
              />
              {memberQuery.trim() && <button type="button" onClick={addCustomMember}>Add</button>}
            </div>
            <div className="assignee-picker-list">
              {availableMembers.length === 0 && !memberQuery.trim() && <span className="assignee-picker-empty">No more workspace members available.</span>}
              {availableMembers.slice(0, 8).map((candidate) => (
                <button type="button" className="assignee-candidate" key={candidate.id} onClick={() => assignMember(candidate)}>
                  <span className="member-avatar">{(candidate.name || candidate.email).slice(0, 1).toUpperCase()}</span>
                  <span><strong>{candidate.name || candidate.email}</strong>{candidate.email && candidate.email !== candidate.name && <small>{candidate.email}</small>}</span>
                  <Plus size={15} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="task-linked-section task-fields-full">
        <div className="section-inline-heading">
          <span>Linked docs</span>
          <button type="button" className="section-link-button" onClick={() => setDocFormOpen((open) => !open)} title="Link a document"><Plus size={15} /> Link</button>
        </div>
        {docFormOpen && (
          <div className="linked-doc-form">
            <input value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="Document name" />
            <input value={docUrl} onChange={(event) => setDocUrl(event.target.value)} placeholder="https://..." onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLinkedDoc(); } }} />
            <button type="button" onClick={addLinkedDoc} disabled={!docTitle.trim() || !docUrl.trim()}>Link</button>
          </div>
        )}
        {task.linkedDocs.length > 0 && (
          <div className="linked-items-list">
            {task.linkedDocs.map((doc) => (
              <div className="linked-item" key={doc.id}>
                <FileText size={16} />
                <a href={doc.url} target="_blank" rel="noreferrer">{doc.title}<ExternalLink size={13} /></a>
                <button type="button" title="Unlink document" onClick={() => update({ linkedDocs: task.linkedDocs.filter((item) => item.id !== doc.id) }, `Unlinked document “${doc.title}”`)}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="task-linked-section task-fields-full">
        <div className="section-inline-heading"><span>Linked work</span></div>
        <div className="linked-work-form">
          <div className="linked-work-input"><Link2 size={16} /><input value={workUrl} onChange={(event) => setWorkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLinkedWork(); } }} placeholder="Paste a GitHub, GitLab, Drive, Dropbox, Zoom, or Meet URL..." /></div>
          <button type="button" onClick={addLinkedWork} disabled={!workUrl.trim()}>Link</button>
        </div>
        <div className="meeting-shortcuts">
          <button type="button" onClick={() => window.open("https://zoom.us/start/videomeeting", "_blank", "noopener,noreferrer")} title="Start a Zoom meeting"><Video size={15} /> Zoom meeting</button>
          <button type="button" onClick={() => window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer")} title="Create a Google Meet"><Video size={15} /> Google Meet</button>
        </div>
        {task.linkedWork.length > 0 && (
          <div className="linked-items-list linked-work-items">
            {task.linkedWork.map((item) => (
              <div className="linked-item" key={item.id}>
                <Link2 size={16} />
                <a href={item.url} target="_blank" rel="noreferrer">{item.label}<ExternalLink size={13} /></a>
                <span className="linked-url-host">{(() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return item.url; } })()}</span>
                <button type="button" title="Unlink work" onClick={() => update({ linkedWork: task.linkedWork.filter((work) => work.id !== item.id) }, `Unlinked ${item.label}`)}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field-control"><span>{label}</span>{children}</label>;
}

function InlineAdd({
  value,
  setValue,
  onAdd,
  placeholder,
}: {
  value: string;
  setValue: (value: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <form className="inline-add" onSubmit={(event) => { event.preventDefault(); onAdd(); }}>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
      <button type="submit"><Plus size={16} /> Add</button>
    </form>
  );
}

function SquareIcon() {
  return <span className="square-icon" />;
}

function RecurrenceModal({
  recurrence,
  onSave,
  onClose,
}: {
  recurrence: TaskRecurrence | null;
  onSave: (recurrence: TaskRecurrence | null) => void;
  onClose: () => void;
}) {
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(recurrence?.frequency ?? "DAILY");
  const [interval, setInterval] = useState(Math.max(1, recurrence?.interval ?? 1));
  const [skipWeekends, setSkipWeekends] = useState(recurrence?.skipWeekends ?? false);
  const [weekdays, setWeekdays] = useState<number[]>(
    recurrence?.weekdays?.length ? recurrence.weekdays : [1, 3, 5]
  );

  const dayButtons = [
    { label: "M", value: 1 },
    { label: "T", value: 2 },
    { label: "W", value: 3 },
    { label: "T", value: 4 },
    { label: "F", value: 5 },
    { label: "S", value: 6 },
    { label: "S", value: 0 },
  ];

  const draft: TaskRecurrence = {
    frequency,
    interval: Math.max(1, interval || 1),
    weekdays: frequency === "WEEKLY" ? weekdays : [],
    skipWeekends: frequency === "DAILY" ? skipWeekends : false,
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <button type="button" className="entity-modal-backdrop recurrence-backdrop" aria-label="Close custom recurrence" onClick={onClose} />
      <section className="recurrence-modal" role="dialog" aria-modal="true" aria-label="Custom recurrence">
        <div className="recurrence-modal-heading">
          <div className="recurrence-icon"><Repeat2 size={18} /></div>
          <div><h2>Custom recurrence</h2><p>We’ll auto-create the next instance when this task is completed.</p></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="recurrence-tabs">
          {(["DAILY", "WEEKLY", "MONTHLY"] as RecurrenceFrequency[]).map((item) => (
            <button type="button" key={item} className={frequency === item ? "active" : ""} onClick={() => setFrequency(item)}>{item.charAt(0) + item.slice(1).toLowerCase()}</button>
          ))}
        </div>

        <div className="recurrence-config-card">
          <label>Repeat every</label>
          <div className="recurrence-interval-row">
            <input type="number" min={1} max={365} value={interval} onChange={(event) => setInterval(Math.max(1, Number(event.target.value) || 1))} />
            <span>{frequency === "DAILY" ? "Day(s)" : frequency === "WEEKLY" ? "Week(s)" : "Month(s)"}</span>
          </div>

          {frequency === "DAILY" && (
            <label className="recurrence-checkbox"><input type="checkbox" checked={skipWeekends} onChange={(event) => setSkipWeekends(event.target.checked)} /><span>Skip weekends</span></label>
          )}

          {frequency === "WEEKLY" && (
            <div className="recurrence-weekdays">
              <span>On these days</span>
              <div>
                {dayButtons.map((day) => {
                  const active = weekdays.includes(day.value);
                  return <button type="button" key={`${day.label}-${day.value}`} className={active ? "active" : ""} onClick={() => setWeekdays((current) => active ? current.filter((value) => value !== day.value) : [...current, day.value])}>{day.label}</button>;
                })}
              </div>
            </div>
          )}
        </div>

        <div className="recurrence-preview"><span className="recurrence-preview-icon">▣</span><span className="recurrence-preview-label">PREVIEW</span><strong>{recurrenceSummary(draft)}</strong></div>

        <div className="recurrence-footer">
          {recurrence && <button type="button" className="recurrence-remove" onClick={() => onSave(null)}>Remove recurrence</button>}
          <span />
          <button type="button" className="modal-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="recurrence-save" disabled={frequency === "WEEKLY" && weekdays.length === 0} onClick={() => onSave(draft)}><Check size={17} /> Set recurrence</button>
        </div>
      </section>
    </>,
    document.body
  );
}

function MoveTaskModal({
  taskTitle,
  destinations,
  onMove,
  onClose,
}: {
  taskTitle: string;
  destinations: TaskMoveDestination[];
  onMove: (destinationFolderPath: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [folderId, setFolderId] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    return destinations.filter((destination) => {
      if (destination.current) return false;
      if (!q) return true;
      return `${destination.listName} ${destination.path}`.toLowerCase().includes(q);
    });
  }, [destinations, query]);

  const selected = destinations.find((destination) => destination.id === selectedListId) ?? null;

  return (
    <>
      <button className="entity-modal-backdrop" aria-label="Close" onClick={onClose} />
      <section className="entity-modal task-move-modal" role="dialog" aria-modal="true">
        <div className="entity-modal-title">
          <div>
            <h2>Move task to another list</h2>
            <p className="task-modal-subtitle">{taskTitle}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <label className="move-search">
          <Search size={17} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lists..." />
        </label>

        <div className="task-list-destinations">
          {filtered.length === 0 && <div className="move-empty">No other lists available.</div>}
          {filtered.map((destination) => (
            <button
              key={destination.id}
              className={selectedListId === destination.id ? "is-selected" : ""}
              onClick={() => {
                setSelectedListId(destination.id);
                setFolderId(destination.folders.length === 1 ? destination.folders[0].id : "");
              }}
            >
              <span className="destination-list-icon">☷</span>
              <span><strong>{destination.listName}</strong><small>{destination.path}</small></span>
              {selectedListId === destination.id && <Check size={16} />}
            </button>
          ))}
        </div>

        {selected && (
          <div className="task-move-folder-picker">
            <label>Destination folder</label>
            {selected.folders.length ? (
              <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
                <option value="">Choose folder...</option>
                {selected.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            ) : (
              <div className="task-move-no-folder">This list has no folder yet. Create a folder there first.</div>
            )}
          </div>
        )}

        <div className="task-modal-footer">
          <button className="modal-secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-primary"
            disabled={!selected || !folderId}
            onClick={() => {
              if (!selected || !folderId) return;
              onMove(`${selected.spaceId}::${selected.projectId}::${selected.listId}::${folderId}`);
              onClose();
            }}
          >
            Move task
          </button>
        </div>
      </section>
    </>
  );
}

function WatchersModal({
  watchers,
  candidates,
  onChange,
  onClose,
}: {
  watchers: TaskWatcher[];
  candidates: WatcherCandidate[];
  onChange: (watchers: TaskWatcher[], message: string) => void;
  onClose: () => void;
}) {
  const [candidateId, setCandidateId] = useState("");
  const selfWatcher: TaskWatcher = { id: "watcher_me", name: "You", email: "" };
  const isWatching = watchers.some((watcher) => watcher.id === selfWatcher.id);
  const available = candidates.filter(
    (candidate) => !watchers.some((watcher) => watcher.email && watcher.email.toLowerCase() === candidate.email.toLowerCase())
  );

  const selected = available.find((candidate) => candidate.id === candidateId);

  return (
    <>
      <button className="entity-modal-backdrop" aria-label="Close" onClick={onClose} />
      <section className="entity-modal watchers-modal" role="dialog" aria-modal="true">
        <div className="entity-modal-title">
          <h2>Watchers</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="watchers-summary">
          <span>{watchers.length} {watchers.length === 1 ? "watcher" : "watchers"}</span>
          <button
            className="watch-task-button"
            onClick={() => {
              if (isWatching) {
                onChange(watchers.filter((watcher) => watcher.id !== selfWatcher.id), "Stopped watching task");
              } else {
                onChange([...watchers, selfWatcher], "Started watching task");
              }
            }}
          >
            {isWatching ? "Unwatch task" : "Watch task"}
          </button>
        </div>

        <div className="watcher-add-row">
          <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
            <option value="">Add teammate as watcher...</option>
            {available.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}{candidate.email ? ` — ${candidate.email}` : ""}
              </option>
            ))}
          </select>
          <button
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onChange(
                [...watchers, { id: uid("watcher"), name: selected.name, email: selected.email }],
                `Added ${selected.name} as watcher`
              );
              setCandidateId("");
            }}
          >
            Add
          </button>
        </div>

        <div className="watcher-list">
          {watchers.length === 0 && <div className="shared-empty">No watchers yet.</div>}
          {watchers.map((watcher) => (
            <div className="watcher-person" key={watcher.id}>
              <span className="watcher-avatar">{watcher.name.charAt(0).toUpperCase() || "?"}</span>
              <span><strong>{watcher.name}</strong>{watcher.email && <small>{watcher.email}</small>}</span>
              <button onClick={() => onChange(watchers.filter((item) => item.id !== watcher.id), `Removed ${watcher.name} as watcher`)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function SaveTemplateModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const saveTemplate = () => {
    const templateName = name.trim();
    if (!templateName) return;

    const existingRaw = window.localStorage.getItem(TASK_TEMPLATE_STORAGE_KEY);
    let existing: unknown[] = [];
    try {
      existing = existingRaw ? JSON.parse(existingRaw) : [];
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    const template = {
      id: uid("template"),
      name: templateName,
      description: description.trim(),
      createdAt: new Date().toISOString(),
      task: {
        title: task.title,
        description: task.description,
        taskType: task.taskType,
        priority: task.priority,
        status: task.status,
        tags: task.tags,
        subtasks: task.subtasks,
        checklist: task.checklist,
      },
    };

    window.localStorage.setItem(TASK_TEMPLATE_STORAGE_KEY, JSON.stringify([...existing, template]));
    window.alert("Task template saved.");
    onClose();
  };

  return (
    <>
      <button className="entity-modal-backdrop" aria-label="Close" onClick={onClose} />
      <section className="entity-modal task-template-modal" role="dialog" aria-modal="true">
        <div className="entity-modal-title">
          <h2>Save as task template</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <p className="template-description">
          Capture this task — title, description, priority, checklists, subtasks, labels, and field values — as a reusable template for this workspace.
        </p>
        <label className="template-field">
          <span>Template name</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Bug report intake" />
        </label>
        <label className="template-field">
          <span>Description (optional)</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="When should teammates use this template?" />
        </label>
        <div className="task-modal-footer">
          <button className="modal-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-primary" disabled={!name.trim()} onClick={saveTemplate}>Save template</button>
        </div>
      </section>
    </>
  );
}
