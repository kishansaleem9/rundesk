"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu, Plus } from "lucide-react";
import Sidebar from "./Sidebar";
import TaskListView from "./TaskListView";
import TaskDrawer from "./TaskDrawer";
import EmptyState from "./EmptyState";
import {
  EMPTY_WORKSPACE,
  SPACE_COLORS,
  createTask,
  loadWorkspace,
  saveWorkspace,
  loadStatuses,
  saveStatuses,
  makeStatusId,
  DEFAULT_STATUSES,
  uid,
} from "@/lib/store";
import type {
  Folder,
  Project,
  Selection,
  SharePermission,
  Space,
  Task,
  TaskList,
  TaskMoveDestination,
  TaskRecurrence,
  TaskStatus,
  StatusDefinition,
  WatcherCandidate,
  CustomFieldDefinition,
  WorkspaceData,
} from "@/lib/types";

const EMPTY_SELECTION: Selection = {
  spaceId: null,
  projectId: null,
  listId: null,
  folderId: null,
};

const SELECTION_STORAGE_KEY = "rundesk-task-selection-v1";

function parseTaskDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTaskDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextRecurringDate(value: string, recurrence: TaskRecurrence) {
  const source = parseTaskDate(value) ?? new Date();
  const next = new Date(source);
  const interval = Math.max(1, recurrence.interval || 1);

  if (recurrence.frequency === "DAILY") {
    next.setDate(next.getDate() + interval);
    if (recurrence.skipWeekends) {
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    }
    return formatTaskDate(next);
  }

  if (recurrence.frequency === "MONTHLY") {
    const targetDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + interval);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(targetDay, lastDay));
    return formatTaskDate(next);
  }

  const selectedDays = recurrence.weekdays.length ? [...recurrence.weekdays].sort((a, b) => a - b) : [source.getDay()];
  const sourceDay = source.getDay();
  for (let offset = 1; offset <= 7 * interval; offset += 1) {
    const candidate = new Date(source);
    candidate.setDate(source.getDate() + offset);
    const weekIndex = Math.floor((sourceDay + offset) / 7);
    if (selectedDays.includes(candidate.getDay()) && weekIndex < interval) return formatTaskDate(candidate);
  }
  next.setDate(next.getDate() + 7 * interval);
  return formatTaskDate(next);
}

function isCompletionStatus(statusId: string, definitions: StatusDefinition[]) {
  const label = definitions.find((status) => status.id === statusId)?.label ?? statusId;
  return /^(complete|completed|done)$/i.test(label.trim());
}

function loadSelection(data: WorkspaceData): Selection {
  if (typeof window === "undefined") return EMPTY_SELECTION;
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return EMPTY_SELECTION;
    const saved = JSON.parse(raw) as Partial<Selection>;

    const space = data.spaces.find((item) => item.id === saved.spaceId);
    if (!space) return EMPTY_SELECTION;

    const project = space.projects.find((item) => item.id === saved.projectId && !item.archived);
    if (!project) return { spaceId: space.id, projectId: null, listId: null, folderId: null };

    const list = project.lists.find((item) => item.id === saved.listId);
    if (!list) return { spaceId: space.id, projectId: project.id, listId: null, folderId: null };

    const folder = list.folders.find((item) => item.id === saved.folderId);
    return {
      spaceId: space.id,
      projectId: project.id,
      listId: list.id,
      folderId: folder?.id ?? null,
    };
  } catch {
    return EMPTY_SELECTION;
  }
}

export default function TaskWorkspace() {
  const [data, setData] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [statusDefinitions, setStatusDefinitions] = useState<StatusDefinition[]>(DEFAULT_STATUSES);

  useEffect(() => {
    const loadedData = loadWorkspace();
    setData(loadedData);
    setStatusDefinitions(loadStatuses());

    const taskId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("task")
        : null;

    if (taskId) {
      let found: Selection | null = null;

      outer: for (const space of loadedData.spaces) {
        for (const project of space.projects) {
          if (project.archived) continue;
          for (const list of project.lists) {
            for (const folder of list.folders) {
              if (folder.tasks.some((task) => task.id === taskId)) {
                found = {
                  spaceId: space.id,
                  projectId: project.id,
                  listId: list.id,
                  folderId: folder.id,
                };
                break outer;
              }
            }
          }
        }
      }

      if (found) {
        setSelection(found);
        setSelectedTaskId(taskId);
      } else {
        setSelection(loadSelection(loadedData));
      }
    } else {
      setSelection(loadSelection(loadedData));
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveWorkspace(data);
  }, [data, hydrated]);

  useEffect(() => {
    if (hydrated) saveStatuses(statusDefinitions);
  }, [statusDefinitions, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selection));
  }, [selection, hydrated]);

  const selectedSpace = useMemo(
    () => data.spaces.find((space) => space.id === selection.spaceId) ?? null,
    [data.spaces, selection.spaceId]
  );

  const selectedProject = useMemo(
    () => selectedSpace?.projects.find((project) => project.id === selection.projectId) ?? null,
    [selectedSpace, selection.projectId]
  );

  const selectedList = useMemo(
    () => selectedProject?.lists.find((list) => list.id === selection.listId) ?? null,
    [selectedProject, selection.listId]
  );

  const selectedFolder = useMemo(
    () => selectedList?.folders.find((folder) => folder.id === selection.folderId) ?? null,
    [selectedList, selection.folderId]
  );

  const selectedTask = useMemo(
    () => selectedFolder?.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedFolder, selectedTaskId]
  );

  const allWorkspaceTasks = useMemo(
    () =>
      data.spaces.flatMap((space) =>
        space.projects.flatMap((project) =>
          project.lists.flatMap((list) => list.folders.flatMap((folder) => folder.tasks))
        )
      ),
    [data.spaces]
  );

  const taskMoveDestinations = useMemo<TaskMoveDestination[]>(() => {
    return data.spaces.flatMap((space) =>
      space.projects.flatMap((project) =>
        project.lists.map((list) => ({
          id: `${space.id}::${project.id}::${list.id}`,
          spaceId: space.id,
          projectId: project.id,
          listId: list.id,
          listName: list.name,
          path: `${space.name} / ${project.name}`,
          folders: list.folders.map((folder) => ({ id: folder.id, name: folder.name })),
          current: list.id === selectedList?.id && project.id === selectedProject?.id && space.id === selectedSpace?.id,
        }))
      )
    );
  }, [data.spaces, selectedList?.id, selectedProject?.id, selectedSpace?.id]);

  const watcherCandidates = useMemo<WatcherCandidate[]>(() => {
    const people = new Map<string, WatcherCandidate>();

    const addEmail = (email: string) => {
      const value = email.trim().toLowerCase();
      if (!value) return;
      const key = `email:${value}`;
      if (!people.has(key)) {
        people.set(key, {
          id: key,
          name: value.split("@")[0] || value,
          email: value,
        });
      }
    };

    const addAssignee = (assignee: string) => {
      const value = assignee.trim();
      if (!value) return;
      if (value.includes("@")) {
        addEmail(value);
        return;
      }
      const key = `name:${value.toLowerCase()}`;
      if (!people.has(key)) people.set(key, { id: key, name: value, email: "" });
    };

    data.spaces.forEach((space) => {
      space.permissions.forEach((permission) => addEmail(permission.email));
      space.projects.forEach((project) => {
        project.permissions.forEach((permission) => addEmail(permission.email));
        project.lists.forEach((list) => {
          list.permissions.forEach((permission) => addEmail(permission.email));
          list.folders.forEach((folder) => {
            folder.permissions.forEach((permission) => addEmail(permission.email));
            folder.tasks.forEach((task) => {
              addAssignee(task.assignee);
              task.permissions.forEach((permission) => addEmail(permission.email));
            });
          });
        });
      });
    });

    return [...people.values()];
  }, [data.spaces]);

  const updateSpaces = (mapper: (spaces: Space[]) => Space[]) => {
    setData((current) => ({ ...current, spaces: mapper(current.spaces) }));
  };

  const createSpace = (name: string) => {
    const space: Space = {
      id: uid("space"),
      name,
      color: SPACE_COLORS[data.spaces.length % SPACE_COLORS.length],
      permissions: [],
      projects: [],
    };
    setData((current) => ({ ...current, spaces: [...current.spaces, space] }));
    setSelection({ spaceId: space.id, projectId: null, listId: null, folderId: null });
  };

  const createProject = (spaceId: string, name: string) => {
    const project: Project = { id: uid("project"), name, archived: false, permissions: [], customFields: [], lists: [] };
    updateSpaces((spaces) => spaces.map((space) => space.id === spaceId ? { ...space, projects: [...space.projects, project] } : space));
    setSelection({ spaceId, projectId: project.id, listId: null, folderId: null });
  };

  const createList = (spaceId: string, projectId: string, name: string) => {
    const list: TaskList = { id: uid("list"), name, isPrivate: false, permissions: [], folders: [] };
    updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : {
      ...space,
      projects: space.projects.map((project) => project.id === projectId ? { ...project, lists: [...project.lists, list] } : project),
    }));
    setSelection({ spaceId, projectId, listId: list.id, folderId: null });
  };

  const createFolder = (spaceId: string, projectId: string, listId: string, name: string) => {
    const folder: Folder = { id: uid("folder"), name, isPrivate: true, permissions: [], tasks: [] };
    updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== projectId ? project : {
        ...project,
        lists: project.lists.map((list) => list.id === listId ? { ...list, folders: [...list.folders, folder] } : list),
      }),
    }));
    setSelection({ spaceId, projectId, listId, folderId: folder.id });
  };

  const createTaskInFolder = (title: string, status: TaskStatus) => {
    if (!selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;
    const task = createTask(title, status);
    updateSpaces((spaces) => spaces.map((space) => space.id !== selectedSpace.id ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== selectedProject.id ? project : {
        ...project,
        lists: project.lists.map((list) => list.id !== selectedList.id ? list : {
          ...list,
          folders: list.folders.map((folder) => folder.id === selectedFolder.id ? { ...folder, tasks: [...folder.tasks, task] } : folder),
        }),
      }),
    }));
  };

  const updateTask = (nextTask: Task) => {
    if (!selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;

    const previousTask = selectedFolder.tasks.find((task) => task.id === nextTask.id);
    const shouldCreateRecurringInstance =
      !!previousTask?.recurrence &&
      !isCompletionStatus(previousTask.status, statusDefinitions) &&
      isCompletionStatus(nextTask.status, statusDefinitions);

    let recurringTask: Task | null = null;
    if (shouldCreateRecurringInstance && previousTask?.recurrence) {
      const now = new Date().toISOString();
      const firstOpenStatus = statusDefinitions.find((status) => !isCompletionStatus(status.id, statusDefinitions)) ?? statusDefinitions[0];
      recurringTask = {
        ...nextTask,
        id: uid("task"),
        status: firstOpenStatus?.id ?? "TODO",
        startDate: nextTask.startDate ? nextRecurringDate(nextTask.startDate, previousTask.recurrence) : "",
        dueDate: nextTask.dueDate ? nextRecurringDate(nextTask.dueDate, previousTask.recurrence) : nextRecurringDate("", previousTask.recurrence),
        reminderAt: "",
        timerStartedAt: null,
        archived: false,
        isFavorite: false,
        favoritePlacement: null,
        createdAt: now,
        updatedAt: now,
        activity: [{ id: uid("activity"), text: `Recurring instance created from “${nextTask.title}”`, createdAt: now }],
      };
      nextTask = {
        ...nextTask,
        activity: [
          { id: uid("activity"), text: `Created next recurring instance for ${recurringTask.dueDate || "the next cycle"}`, createdAt: now },
          ...nextTask.activity,
        ],
      };
    }

    updateSpaces((spaces) => spaces.map((space) => space.id !== selectedSpace.id ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== selectedProject.id ? project : {
        ...project,
        lists: project.lists.map((list) => list.id !== selectedList.id ? list : {
          ...list,
          folders: list.folders.map((folder) => folder.id !== selectedFolder.id ? folder : {
            ...folder,
            tasks: [
              ...folder.tasks.map((task) => task.id === nextTask.id ? nextTask : task),
              ...(recurringTask ? [recurringTask] : []),
            ],
          }),
        }),
      }),
    }));
  };

  const deleteTask = (taskId: string) => {
    if (!selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;
    updateSpaces((spaces) => spaces.map((space) => space.id !== selectedSpace.id ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== selectedProject.id ? project : {
        ...project,
        lists: project.lists.map((list) => list.id !== selectedList.id ? list : {
          ...list,
          folders: list.folders.map((folder) => folder.id !== selectedFolder.id ? folder : { ...folder, tasks: folder.tasks.filter((task) => task.id !== taskId) }),
        }),
      }),
    }));
    setSelectedTaskId(null);
  };

  const duplicateTask = (task: Task) => {
    if (!selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;
    const now = new Date().toISOString();
    const duplicate: Task = {
      ...task,
      id: uid("task"),
      title: `${task.title} copy`,
      createdAt: now,
      updatedAt: now,
      activity: [{ id: uid("activity"), text: "Task duplicated", createdAt: now }, ...task.activity],
    };
    updateSpaces((spaces) => spaces.map((space) => space.id !== selectedSpace.id ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== selectedProject.id ? project : {
        ...project,
        lists: project.lists.map((list) => list.id !== selectedList.id ? list : {
          ...list,
          folders: list.folders.map((folder) => folder.id === selectedFolder.id ? { ...folder, tasks: [...folder.tasks, duplicate] } : folder),
        }),
      }),
    }));
    setSelectedTaskId(duplicate.id);
  };

  const mergeTaskIntoCurrent = (otherTaskId: string) => {
    if (!selectedTask || !selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;
    const other = selectedFolder.tasks.find((task) => task.id === otherTaskId);
    if (!other || other.id === selectedTask.id) return;

    const now = new Date().toISOString();
    const uniqueTags = Array.from(new Set([...selectedTask.tags, ...other.tags]));
    const uniqueDependencies = Array.from(
      new Set([...selectedTask.dependencyIds, ...other.dependencyIds].filter((id) => id !== selectedTask.id && id !== other.id))
    );
    const watcherMap = new Map([...selectedTask.watchers, ...other.watchers].map((watcher) => [watcher.id, watcher]));
    const permissionMap = new Map(
      [...selectedTask.permissions, ...other.permissions].map((permission) => [permission.email.toLowerCase(), permission])
    );

    const merged: Task = {
      ...selectedTask,
      description: [selectedTask.description.trim(), other.description.trim()].filter(Boolean).join("\n\n---\n\n"),
      tags: uniqueTags,
      watchers: [...watcherMap.values()],
      permissions: [...permissionMap.values()],
      subtasks: [...selectedTask.subtasks, ...other.subtasks],
      checklist: [...selectedTask.checklist, ...other.checklist],
      dependencyIds: uniqueDependencies,
      attachments: [...selectedTask.attachments, ...other.attachments],
      comments: [...selectedTask.comments, ...other.comments],
      relationships: [
        ...selectedTask.relationships,
        ...other.relationships.filter(
          (relationship) =>
            !selectedTask.relationships.some(
              (existing) =>
                existing.taskId === relationship.taskId && existing.kind === relationship.kind
            )
        ),
      ],
      updatedAt: now,
      activity: [
        { id: uid("activity"), text: `Merged task “${other.title}” into this task`, createdAt: now },
        ...selectedTask.activity,
        ...other.activity,
      ],
    };

    updateSpaces((spaces) =>
      spaces.map((space) =>
        space.id !== selectedSpace.id
          ? space
          : {
              ...space,
              projects: space.projects.map((project) =>
                project.id !== selectedProject.id
                  ? project
                  : {
                      ...project,
                      lists: project.lists.map((list) =>
                        list.id !== selectedList.id
                          ? list
                          : {
                              ...list,
                              folders: list.folders.map((folder) =>
                                folder.id !== selectedFolder.id
                                  ? folder
                                  : {
                                      ...folder,
                                      tasks: folder.tasks
                                        .filter((task) => task.id !== otherTaskId)
                                        .map((task) => (task.id === selectedTask.id ? merged : task)),
                                    }
                              ),
                            }
                      ),
                    }
              ),
            }
      )
    );
  };

  const convertTaskToSubtask = (parentTaskId: string) => {
    if (!selectedTask || !selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;
    const parent = selectedFolder.tasks.find((task) => task.id === parentTaskId);
    if (!parent || parent.id === selectedTask.id) return;

    const now = new Date().toISOString();
    const nextParent: Task = {
      ...parent,
      subtasks: [
        ...parent.subtasks,
        {
          id: uid("subtask"),
          title: selectedTask.title,
          done: selectedTask.status === "COMPLETE",
        },
      ],
      updatedAt: now,
      activity: [
        { id: uid("activity"), text: `Converted task “${selectedTask.title}” to a subtask`, createdAt: now },
        ...parent.activity,
      ],
    };

    updateSpaces((spaces) =>
      spaces.map((space) =>
        space.id !== selectedSpace.id
          ? space
          : {
              ...space,
              projects: space.projects.map((project) =>
                project.id !== selectedProject.id
                  ? project
                  : {
                      ...project,
                      lists: project.lists.map((list) =>
                        list.id !== selectedList.id
                          ? list
                          : {
                              ...list,
                              folders: list.folders.map((folder) =>
                                folder.id !== selectedFolder.id
                                  ? folder
                                  : {
                                      ...folder,
                                      tasks: folder.tasks
                                        .filter((task) => task.id !== selectedTask.id)
                                        .map((task) => (task.id === parentTaskId ? nextParent : task)),
                                    }
                              ),
                            }
                      ),
                    }
              ),
            }
      )
    );

    setSelectedTaskId(parentTaskId);
  };

  const convertTaskToList = () => {
    if (!selectedTask || !selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;

    const convertedList: TaskList = {
      id: uid("list"),
      name: selectedTask.title.trim() || "Converted task",
      isPrivate: selectedTask.isPrivate,
      permissions: [...selectedTask.permissions],
      folders: [],
    };

    updateSpaces((spaces) =>
      spaces.map((space) =>
        space.id !== selectedSpace.id
          ? space
          : {
              ...space,
              projects: space.projects.map((project) =>
                project.id !== selectedProject.id
                  ? project
                  : {
                      ...project,
                      lists: [
                        ...project.lists.map((list) =>
                          list.id !== selectedList.id
                            ? list
                            : {
                                ...list,
                                folders: list.folders.map((folder) =>
                                  folder.id !== selectedFolder.id
                                    ? folder
                                    : {
                                        ...folder,
                                        tasks: folder.tasks.filter((task) => task.id !== selectedTask.id),
                                      }
                                ),
                              }
                        ),
                        convertedList,
                      ],
                    }
              ),
            }
      )
    );

    setSelection({
      spaceId: selectedSpace.id,
      projectId: selectedProject.id,
      listId: convertedList.id,
      folderId: null,
    });
    setSelectedTaskId(null);
  };

  const renameSpace = (spaceId: string, name: string) => updateSpaces((spaces) => spaces.map((space) => space.id === spaceId ? { ...space, name } : space));
  const renameProject = (spaceId: string, projectId: string, name: string) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id === projectId ? { ...project, name } : project) }));
  const renameList = (spaceId: string, projectId: string, listId: string, name: string) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.map((list) => list.id === listId ? { ...list, name } : list) }) }));
  const renameFolder = (spaceId: string, projectId: string, listId: string, folderId: string, name: string) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.map((list) => list.id !== listId ? list : { ...list, folders: list.folders.map((folder) => folder.id === folderId ? { ...folder, name } : folder) }) }) }));

  const deleteSpace = (spaceId: string) => {
    updateSpaces((spaces) => spaces.filter((space) => space.id !== spaceId));
    if (selection.spaceId === spaceId) setSelection(EMPTY_SELECTION);
    setSelectedTaskId(null);
  };

  const archiveProject = (spaceId: string, projectId: string) => {
    updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id === projectId ? { ...project, archived: true } : project) }));
    if (selection.projectId === projectId) setSelection({ spaceId, projectId: null, listId: null, folderId: null });
    setSelectedTaskId(null);
  };

  const deleteList = (spaceId: string, projectId: string, listId: string) => {
    updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.filter((list) => list.id !== listId) }) }));
    if (selection.listId === listId) setSelection({ spaceId, projectId, listId: null, folderId: null });
    setSelectedTaskId(null);
  };

  const deleteFolder = (spaceId: string, projectId: string, listId: string, folderId: string) => {
    updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.map((list) => list.id !== listId ? list : { ...list, folders: list.folders.filter((folder) => folder.id !== folderId) }) }) }));
    if (selection.folderId === folderId) setSelection({ spaceId, projectId, listId, folderId: null });
    setSelectedTaskId(null);
  };

  const toggleListPrivacy = (spaceId: string, projectId: string, listId: string) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.map((list) => list.id === listId ? { ...list, isPrivate: !list.isPrivate } : list) }) }));
  const toggleFolderPrivacy = (spaceId: string, projectId: string, listId: string, folderId: string) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.map((list) => list.id !== listId ? list : { ...list, folders: list.folders.map((folder) => folder.id === folderId ? { ...folder, isPrivate: !folder.isPrivate } : folder) }) }) }));

  const setSpacePermissions = (spaceId: string, permissions: SharePermission[]) => updateSpaces((spaces) => spaces.map((space) => space.id === spaceId ? { ...space, permissions } : space));
  const setProjectPermissions = (spaceId: string, projectId: string, permissions: SharePermission[]) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id === projectId ? { ...project, permissions } : project) }));
  const setListPermissions = (spaceId: string, projectId: string, listId: string, permissions: SharePermission[]) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.map((list) => list.id === listId ? { ...list, permissions } : list) }) }));
  const setFolderPermissions = (spaceId: string, projectId: string, listId: string, folderId: string, permissions: SharePermission[]) => updateSpaces((spaces) => spaces.map((space) => space.id !== spaceId ? space : { ...space, projects: space.projects.map((project) => project.id !== projectId ? project : { ...project, lists: project.lists.map((list) => list.id !== listId ? list : { ...list, folders: list.folders.map((folder) => folder.id === folderId ? { ...folder, permissions } : folder) }) }) }));

  const moveProject = (spaceId: string, projectId: string, destinationSpaceId: string) => {
    if (spaceId === destinationSpaceId) return;
    const project = data.spaces.find((space) => space.id === spaceId)?.projects.find((item) => item.id === projectId);
    if (!project) return;
    updateSpaces((spaces) => spaces.map((space) => {
      if (space.id === spaceId) return { ...space, projects: space.projects.filter((item) => item.id !== projectId) };
      if (space.id === destinationSpaceId) return { ...space, projects: [...space.projects, project] };
      return space;
    }));
    setSelection({ spaceId: destinationSpaceId, projectId, listId: null, folderId: null });
    setSelectedTaskId(null);
  };

  const moveList = (spaceId: string, projectId: string, listId: string, destination: string) => {
    const [destinationSpaceId, destinationProjectId] = destination.split("::");
    if (spaceId === destinationSpaceId && projectId === destinationProjectId) return;
    const list = data.spaces.find((space) => space.id === spaceId)?.projects.find((project) => project.id === projectId)?.lists.find((item) => item.id === listId);
    if (!list) return;
    updateSpaces((spaces) => spaces.map((space) => ({
      ...space,
      projects: space.projects.map((project) => {
        if (space.id === spaceId && project.id === projectId) return { ...project, lists: project.lists.filter((item) => item.id !== listId) };
        if (space.id === destinationSpaceId && project.id === destinationProjectId) return { ...project, lists: [...project.lists, list] };
        return project;
      }),
    })));
    setSelection({ spaceId: destinationSpaceId, projectId: destinationProjectId, listId, folderId: null });
    setSelectedTaskId(null);
  };

  const moveFolder = (spaceId: string, projectId: string, listId: string, folderId: string, destination: string) => {
    const [destinationSpaceId, destinationProjectId, destinationListId] = destination.split("::");
    if (spaceId === destinationSpaceId && projectId === destinationProjectId && listId === destinationListId) return;
    const folder = data.spaces.find((space) => space.id === spaceId)?.projects.find((project) => project.id === projectId)?.lists.find((list) => list.id === listId)?.folders.find((item) => item.id === folderId);
    if (!folder) return;
    updateSpaces((spaces) => spaces.map((space) => ({
      ...space,
      projects: space.projects.map((project) => ({
        ...project,
        lists: project.lists.map((list) => {
          if (space.id === spaceId && project.id === projectId && list.id === listId) return { ...list, folders: list.folders.filter((item) => item.id !== folderId) };
          if (space.id === destinationSpaceId && project.id === destinationProjectId && list.id === destinationListId) return { ...list, folders: [...list.folders, folder] };
          return list;
        }),
      })),
    })));
    setSelection({ spaceId: destinationSpaceId, projectId: destinationProjectId, listId: destinationListId, folderId });
    setSelectedTaskId(null);
  };

  const moveTaskToFolder = (destinationFolderPath: string) => {
    if (!selectedTask || !selectedSpace || !selectedProject || !selectedList || !selectedFolder) return;

    const [destinationSpaceId, destinationProjectId, destinationListId, destinationFolderId] = destinationFolderPath.split("::");
    if (!destinationSpaceId || !destinationProjectId || !destinationListId || !destinationFolderId) return;
    if (destinationFolderId === selectedFolder.id) return;

    const movingTask = selectedTask;
    const now = new Date().toISOString();
    const movedTask: Task = {
      ...movingTask,
      updatedAt: now,
      activity: [{ id: uid("activity"), text: "Moved task to another list", createdAt: now }, ...movingTask.activity],
    };

    setData((current) => ({
      ...current,
      spaces: current.spaces.map((space) => ({
        ...space,
        projects: space.projects.map((project) => ({
          ...project,
          lists: project.lists.map((list) => ({
            ...list,
            folders: list.folders.map((folder) => {
              const isSource =
                space.id === selectedSpace.id &&
                project.id === selectedProject.id &&
                list.id === selectedList.id &&
                folder.id === selectedFolder.id;
              const isDestination =
                space.id === destinationSpaceId &&
                project.id === destinationProjectId &&
                list.id === destinationListId &&
                folder.id === destinationFolderId;

              let tasks = folder.tasks;
              if (isSource) tasks = tasks.filter((task) => task.id !== movingTask.id);
              if (isDestination) tasks = [...tasks, movedTask];
              return tasks === folder.tasks ? folder : { ...folder, tasks };
            }),
          })),
        })),
      })),
    }));

    setSelection({
      spaceId: destinationSpaceId,
      projectId: destinationProjectId,
      listId: destinationListId,
      folderId: destinationFolderId,
    });
    setSelectedTaskId(movingTask.id);
  };

  const createStatusDefinition = (label: string, color: string) => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    setStatusDefinitions((current) => {
      let id = makeStatusId(cleanLabel);
      let suffix = 2;
      while (current.some((status) => status.id === id)) {
        id = `${makeStatusId(cleanLabel)}_${suffix++}`;
      }
      return [...current, { id, label: cleanLabel, color }];
    });
  };

  const renameStatusDefinition = (statusId: string, label: string, color: string) => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    setStatusDefinitions((current) =>
      current.map((status) =>
        status.id === statusId ? { ...status, label: cleanLabel, color } : status
      )
    );
  };

  const deleteStatusDefinition = (statusId: string) => {
    if (statusDefinitions.length <= 1) return;
    const status = statusDefinitions.find((item) => item.id === statusId);
    if (!status) return;
    const remaining = statusDefinitions.filter((item) => item.id !== statusId);
    const replacement = remaining[0];
    if (!replacement) return;
    if (!window.confirm(`Delete status “${status.label}”? Tasks using it will move to “${replacement.label}”.`)) return;

    setStatusDefinitions(remaining);
    setData((current) => ({
      ...current,
      spaces: current.spaces.map((space) => ({
        ...space,
        projects: space.projects.map((project) => ({
          ...project,
          lists: project.lists.map((list) => ({
            ...list,
            folders: list.folders.map((folder) => ({
              ...folder,
              tasks: folder.tasks.map((task) =>
                task.status === statusId
                  ? {
                      ...task,
                      status: replacement.id,
                      updatedAt: new Date().toISOString(),
                      activity: [
                        {
                          id: uid("activity"),
                          text: `Status “${status.label}” was deleted; changed to “${replacement.label}”`,
                          createdAt: new Date().toISOString(),
                        },
                        ...task.activity,
                      ],
                    }
                  : task
              ),
            })),
          })),
        })),
      })),
    }));
  };

  const createProjectCustomField = (name: string, type: CustomFieldDefinition["type"]) => {
    if (!selectedSpace || !selectedProject) return;
    const clean = name.trim();
    if (!clean) return;
    const field: CustomFieldDefinition = { id: uid("field"), name: clean, type };
    updateSpaces((spaces) => spaces.map((space) => space.id !== selectedSpace.id ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== selectedProject.id ? project : {
        ...project,
        customFields: [...project.customFields, field],
      }),
    }));
  };

  const renameProjectCustomField = (fieldId: string, name: string) => {
    if (!selectedSpace || !selectedProject) return;
    const clean = name.trim();
    if (!clean) return;
    updateSpaces((spaces) => spaces.map((space) => space.id !== selectedSpace.id ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== selectedProject.id ? project : {
        ...project,
        customFields: project.customFields.map((field) => field.id === fieldId ? { ...field, name: clean } : field),
      }),
    }));
  };

  const deleteProjectCustomField = (fieldId: string) => {
    if (!selectedSpace || !selectedProject) return;
    updateSpaces((spaces) => spaces.map((space) => space.id !== selectedSpace.id ? space : {
      ...space,
      projects: space.projects.map((project) => project.id !== selectedProject.id ? project : {
        ...project,
        customFields: project.customFields.filter((field) => field.id !== fieldId),
        lists: project.lists.map((list) => ({
          ...list,
          folders: list.folders.map((folder) => ({
            ...folder,
            tasks: folder.tasks.map((task) => {
              if (!(fieldId in task.customFieldValues)) return task;
              const nextValues = { ...task.customFieldValues };
              delete nextValues[fieldId];
              return { ...task, customFieldValues: nextValues };
            }),
          })),
        })),
      }),
    }));
  };

  const resetWorkspace = () => {
    if (!window.confirm("Clear all local Rundesk task data?")) return;
    setData(EMPTY_WORKSPACE);
    setSelection(EMPTY_SELECTION);
    setSelectedTaskId(null);
  };

  if (!hydrated) return <div className="loading-screen">Loading Rundesk…</div>;

  return (
    <div className={`app-frame ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      {!sidebarCollapsed && (
        <Sidebar
          workspaceName={data.workspaceName}
          spaces={data.spaces}
          selection={selection}
          onSelect={(next) => { setSelection(next); setSelectedTaskId(null); }}
          onCreateSpace={createSpace}
          onCreateProject={createProject}
          onCreateList={createList}
          onCreateFolder={createFolder}
          onRenameSpace={renameSpace}
          onRenameProject={renameProject}
          onRenameList={renameList}
          onRenameFolder={renameFolder}
          onDeleteSpace={deleteSpace}
          onArchiveProject={archiveProject}
          onDeleteList={deleteList}
          onDeleteFolder={deleteFolder}
          onToggleListPrivacy={toggleListPrivacy}
          onToggleFolderPrivacy={toggleFolderPrivacy}
          onSetSpacePermissions={setSpacePermissions}
          onSetProjectPermissions={setProjectPermissions}
          onSetListPermissions={setListPermissions}
          onSetFolderPermissions={setFolderPermissions}
          onMoveProject={moveProject}
          onMoveList={moveList}
          onMoveFolder={moveFolder}
          onCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      {sidebarCollapsed && <button className="reopen-sidebar" onClick={() => setSidebarCollapsed(false)}><Menu size={19} /></button>}

      <div className="main-area">
        {selectedFolder && selectedList && selectedProject && selectedSpace ? (
          <TaskListView
            folder={selectedFolder}
            spaceName={selectedSpace.name}
            projectName={selectedProject.name}
            listName={selectedList.name}
            statuses={statusDefinitions}
            onCreateTask={createTaskInFolder}
            onOpenTask={setSelectedTaskId}
            onUpdateTask={updateTask}
          />
        ) : selectedList ? (
          <div className="blank-content"><EmptyState level="list" /><p className="blank-helper">Use the <Plus size={14} /> button beside the list in the sidebar to create a folder.</p></div>
        ) : selectedProject ? (
          <div className="blank-content"><EmptyState level="project" /><p className="blank-helper">Use the <Plus size={14} /> button beside the project in the sidebar to create a list.</p></div>
        ) : selectedSpace ? (
          <div className="blank-content"><EmptyState level="space" /><p className="blank-helper">Use the <Plus size={14} /> button beside the space in the sidebar to create a project.</p></div>
        ) : (
          <div className="blank-content">
            <EmptyState level="workspace" />
            <p className="blank-helper">Use <strong>New space</strong> in the sidebar to begin.</p>
            {data.spaces.length > 0 && <button className="text-button" onClick={resetWorkspace}>Reset local workspace</button>}
          </div>
        )}
      </div>

      {selectedTask && selectedFolder && (
        <TaskDrawer
          task={selectedTask}
          allTasks={allWorkspaceTasks}
          moveDestinations={taskMoveDestinations}
          watcherCandidates={watcherCandidates}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={updateTask}
          onMoveTask={moveTaskToFolder}
          onDuplicate={() => duplicateTask(selectedTask)}
          onDelete={() => deleteTask(selectedTask.id)}
          onMergeTask={mergeTaskIntoCurrent}
          onConvertToSubtask={convertTaskToSubtask}
          onConvertToList={convertTaskToList}
          statusDefinitions={statusDefinitions}
          onCreateStatus={createStatusDefinition}
          onRenameStatus={renameStatusDefinition}
          onDeleteStatus={deleteStatusDefinition}
          customFieldDefinitions={selectedProject?.customFields ?? []}
          onCreateCustomField={createProjectCustomField}
          onRenameCustomField={renameProjectCustomField}
          onDeleteCustomField={deleteProjectCustomField}
        />
      )}
    </div>
  );
}
