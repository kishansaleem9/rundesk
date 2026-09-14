"use client";

import { FolderPlus, Layers3, ListPlus, Plus, Sparkles } from "lucide-react";

type EmptyLevel = "workspace" | "space" | "project" | "list";

export default function EmptyState({
  level,
  onAction,
}: {
  level: EmptyLevel;
  onAction?: () => void;
}) {
  const copy = {
    workspace: {
      icon: <Sparkles size={28} />,
      title: "Create your first space",
      text: "Start with a space, then add projects, lists, folders, and tasks.",
      action: "New space",
    },
    space: {
      icon: <Layers3 size={28} />,
      title: "This space is empty",
      text: "Create a project inside this space to get started.",
      action: "Create project",
    },
    project: {
      icon: <ListPlus size={28} />,
      title: "This project is empty",
      text: "Create a list inside this project.",
      action: "Create list",
    },
    list: {
      icon: <FolderPlus size={28} />,
      title: "This list is empty",
      text: "Create a folder inside this list, then add tasks.",
      action: "Create folder",
    },
  }[level];

  return (
    <section className="empty-state">
      <div className="empty-icon">{copy.icon}</div>
      <h2>{copy.title}</h2>
      <p>{copy.text}</p>
      {onAction && (
        <button className="primary-button" onClick={onAction}>
          <Plus size={16} /> {copy.action}
        </button>
      )}
    </section>
  );
}
