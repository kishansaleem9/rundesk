"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder as FolderIcon,
  Globe2,
  Layers3,
  ListTree,
  Lock,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { MoveModal, SharePermissionsModal, type MoveDestination } from "./EntityModals";
import type { Selection, SharePermission, Space } from "@/lib/types";

interface SidebarProps {
  workspaceName: string;
  spaces: Space[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCreateSpace: (name: string) => void;
  onCreateProject: (spaceId: string, name: string) => void;
  onCreateList: (spaceId: string, projectId: string, name: string) => void;
  onCreateFolder: (spaceId: string, projectId: string, listId: string, name: string) => void;
  onRenameSpace: (spaceId: string, name: string) => void;
  onRenameProject: (spaceId: string, projectId: string, name: string) => void;
  onRenameList: (spaceId: string, projectId: string, listId: string, name: string) => void;
  onRenameFolder: (spaceId: string, projectId: string, listId: string, folderId: string, name: string) => void;
  onDeleteSpace: (spaceId: string) => void;
  onArchiveProject: (spaceId: string, projectId: string) => void;
  onDeleteList: (spaceId: string, projectId: string, listId: string) => void;
  onDeleteFolder: (spaceId: string, projectId: string, listId: string, folderId: string) => void;
  onToggleListPrivacy: (spaceId: string, projectId: string, listId: string) => void;
  onToggleFolderPrivacy: (spaceId: string, projectId: string, listId: string, folderId: string) => void;
  onSetSpacePermissions: (spaceId: string, permissions: SharePermission[]) => void;
  onSetProjectPermissions: (spaceId: string, projectId: string, permissions: SharePermission[]) => void;
  onSetListPermissions: (spaceId: string, projectId: string, listId: string, permissions: SharePermission[]) => void;
  onSetFolderPermissions: (spaceId: string, projectId: string, listId: string, folderId: string, permissions: SharePermission[]) => void;
  onMoveProject: (spaceId: string, projectId: string, destinationSpaceId: string) => void;
  onMoveList: (spaceId: string, projectId: string, listId: string, destination: string) => void;
  onMoveFolder: (spaceId: string, projectId: string, listId: string, folderId: string, destination: string) => void;
  onCollapse: () => void;
}

type ComposerState =
  | { type: "space" }
  | { type: "project"; spaceId: string }
  | { type: "list"; spaceId: string; projectId: string }
  | { type: "folder"; spaceId: string; projectId: string; listId: string }
  | null;

type ModalState =
  | { type: "share-space"; spaceId: string }
  | { type: "share-project"; spaceId: string; projectId: string }
  | { type: "share-list"; spaceId: string; projectId: string; listId: string }
  | { type: "share-folder"; spaceId: string; projectId: string; listId: string; folderId: string }
  | { type: "move-project"; spaceId: string; projectId: string }
  | { type: "move-list"; spaceId: string; projectId: string; listId: string }
  | { type: "move-folder"; spaceId: string; projectId: string; listId: string; folderId: string }
  | null;

function InlineComposer({ placeholder, onSubmit, onCancel }: { placeholder: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form className="tree-composer" onSubmit={(event) => { event.preventDefault(); const name = value.trim(); if (!name) return; onSubmit(name); setValue(""); }}>
      <input ref={ref} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Escape" && onCancel()} onBlur={() => !value.trim() && onCancel()} placeholder={placeholder} />
      <button type="submit" aria-label="Save"><Plus size={14} /></button>
    </form>
  );
}

function ActionMenu({
  items,
}: {
  items: Array<{
    label: string;
    icon: ReactNode;
    danger?: boolean;
    dividerBefore?: boolean;
    onClick: () => void;
  }>;
}) {
  const reactId = useId();
  const menuId = `sidebar-menu-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const placeMenu = () => {
      const button = buttonRef.current;
      if (!button || !menu.matches(":popover-open")) return;

      const rect = button.getBoundingClientRect();
      const menuWidth = 210;
      const dividerCount = items.filter((item) => item.dividerBefore).length;
      const estimatedHeight = Math.min(
        window.innerHeight - 16,
        items.length * 38 + 12 + dividerCount * 5
      );

      let left = rect.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

      let top = rect.bottom + 6;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }

      menu.style.position = "fixed";
      menu.style.inset = "auto";
      menu.style.margin = "0";
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
    };

    const handleToggle = () => requestAnimationFrame(placeMenu);
    menu.addEventListener("toggle", handleToggle);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);

    return () => {
      menu.removeEventListener("toggle", handleToggle);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [items.length]);

  const buttonPopoverProps = { popoverTarget: menuId } as Record<string, unknown>;
  const menuPopoverProps = { popover: "auto" } as Record<string, unknown>;

  const closeMenu = () => {
    const menu = menuRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
    if (menu?.hidePopover) menu.hidePopover();
  };

  return (
    <div className="tree-menu-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button tree-more"
        aria-label="More actions"
        aria-haspopup="menu"
        {...buttonPopoverProps}
      >
        <MoreHorizontal size={16} />
      </button>

      <div
        ref={menuRef}
        id={menuId}
        className="entity-action-menu native-sidebar-popover"
        role="menu"
        {...menuPopoverProps}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`${item.danger ? "danger-text" : ""} ${
              item.dividerBefore ? "menu-divider-before" : ""
            }`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeMenu();
              item.onClick();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const SIDEBAR_EXPANDED_SPACES_KEY = "rundesk-expanded-spaces-v2";
const SIDEBAR_EXPANDED_PROJECTS_KEY = "rundesk-expanded-projects-v2";
const SIDEBAR_EXPANDED_LISTS_KEY = "rundesk-expanded-lists-v2";

function readExpandedState(key: string, fallbackIds: Array<string | null>): Set<string> {
  const fallback = new Set(
    fallbackIds.filter((item): item is string => typeof item === "string" && item.length > 0)
  );

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;

    return new Set(
      parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
    );
  } catch {
    return fallback;
  }
}

function saveExpandedState(key: string, value: Set<string>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
  } catch {
    // localStorage can be unavailable in restricted/private browser contexts.
  }
}

export default function Sidebar(props: SidebarProps) {
  const { workspaceName, spaces, selection, onSelect, onCollapse } = props;
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState<ComposerState>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(() =>
    readExpandedState(SIDEBAR_EXPANDED_SPACES_KEY, [selection.spaceId])
  );
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() =>
    readExpandedState(SIDEBAR_EXPANDED_PROJECTS_KEY, [selection.projectId])
  );
  const [expandedLists, setExpandedLists] = useState<Set<string>>(() =>
    readExpandedState(SIDEBAR_EXPANDED_LISTS_KEY, [selection.listId])
  );

  useEffect(() => {
    saveExpandedState(SIDEBAR_EXPANDED_SPACES_KEY, expandedSpaces);
  }, [expandedSpaces]);

  useEffect(() => {
    saveExpandedState(SIDEBAR_EXPANDED_PROJECTS_KEY, expandedProjects);
  }, [expandedProjects]);

  useEffect(() => {
    saveExpandedState(SIDEBAR_EXPANDED_LISTS_KEY, expandedLists);
  }, [expandedLists]);

  const rename = (label: string, current: string, save: (name: string) => void) => {
    const next = window.prompt(`Rename ${label}`, current)?.trim();
    if (next && next !== current) save(next);
  };

  const confirmDelete = (label: string, action: () => void) => {
    if (window.confirm(`Delete this ${label}? This will also delete everything inside it.`)) action();
  };

  const filteredSpaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return spaces;
    return spaces.map((space) => ({
      ...space,
      projects: space.projects.map((project) => ({
        ...project,
        lists: project.lists.map((list) => ({
          ...list,
          folders: list.folders.filter((folder) => folder.name.toLowerCase().includes(q)),
        })).filter((list) => list.name.toLowerCase().includes(q) || list.folders.length),
      })).filter((project) => !project.archived && (project.name.toLowerCase().includes(q) || project.lists.length)),
    })).filter((space) => space.name.toLowerCase().includes(q) || space.projects.length);
  }, [spaces, query]);

  const findSpace = (spaceId: string) => spaces.find((space) => space.id === spaceId)!;
  const findProject = (spaceId: string, projectId: string) => findSpace(spaceId).projects.find((project) => project.id === projectId)!;
  const findList = (spaceId: string, projectId: string, listId: string) => findProject(spaceId, projectId).lists.find((list) => list.id === listId)!;
  const findFolder = (spaceId: string, projectId: string, listId: string, folderId: string) => findList(spaceId, projectId, listId).folders.find((folder) => folder.id === folderId)!;

  const projectDestinations = (spaceId: string): MoveDestination[] => spaces.map((space) => ({ id: space.id, name: space.name, kind: "space", current: space.id === spaceId }));
  const listDestinations = (spaceId: string, projectId: string): MoveDestination[] => spaces.flatMap((space) => space.projects.filter((project) => !project.archived).map((project) => ({ id: `${space.id}::${project.id}`, name: project.name, path: space.name, kind: "project" as const, current: space.id === spaceId && project.id === projectId })));
  const folderDestinations = (spaceId: string, projectId: string, listId: string): MoveDestination[] => spaces.flatMap((space) => space.projects.filter((project) => !project.archived).flatMap((project) => project.lists.map((list) => ({ id: `${space.id}::${project.id}::${list.id}`, name: list.name, path: `${space.name} / ${project.name}`, kind: "list" as const, current: space.id === spaceId && project.id === projectId && list.id === listId }))));

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-topline"><button className="icon-button collapse-button" onClick={onCollapse} title="Collapse sidebar"><PanelLeftClose size={18} /></button></div>
        <button className="workspace-card"><span className="workspace-logo">R</span><span className="workspace-copy"><strong>{workspaceName}</strong><small>Workspace</small></span><ChevronDown size={17} /></button>
        <div className="sidebar-divider" />
        <div className="sidebar-scroll">
          <label className="sidebar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a space or list..." /></label>
          <div className="sidebar-hint"><Star size={16} /><span>Star lists/projects to pin them here</span></div>
          <div className="sidebar-hint"><Clock3 size={16} /><span>Recent items will appear as you navigate</span></div>

          <div className="sidebar-section-heading">
            <span>Spaces</span>
            <button
              className="sidebar-section-add"
              type="button"
              title="New space"
              aria-label="New space"
              onClick={() => setComposer({ type: "space" })}
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="project-tree">
            {filteredSpaces.map((space) => {
              const spaceOpen = expandedSpaces.has(space.id) || !!query;
              const activeProjects = space.projects.filter((project) => !project.archived);
              return (
                <div className="project-node" key={space.id}>
                  <div className={`tree-row project-row ${selection.spaceId === space.id && !selection.projectId ? "is-active-parent" : ""}`}>
                    <button className="tree-chevron" onClick={() => setExpandedSpaces((set) => { const next = new Set(set); next.has(space.id) ? next.delete(space.id) : next.add(space.id); return next; })}>{spaceOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
                    <button className="tree-main" onClick={() => onSelect({ spaceId: space.id, projectId: null, listId: null, folderId: null })}><Layers3 size={18} style={{ color: space.color }} /><span>{space.name}</span></button>
                    <button className="icon-button tree-add" title="New project" onClick={() => { setComposer({ type: "project", spaceId: space.id }); setExpandedSpaces((set) => new Set(set).add(space.id)); }}><Plus size={15} /></button>
                    <ActionMenu items={[
                      { label: "Rename", icon: <Pencil size={18} />, onClick: () => rename("space", space.name, (name) => props.onRenameSpace(space.id, name)) },
                      { label: "Share & Permissions", icon: <Share2 size={18} />, onClick: () => setModal({ type: "share-space", spaceId: space.id }) },
                      { label: "Delete space", icon: <Trash2 size={18} />, danger: true, dividerBefore: true, onClick: () => confirmDelete("space", () => props.onDeleteSpace(space.id)) },
                    ]} />
                  </div>

                  {spaceOpen && <div className="tree-children project-children">
                    {activeProjects.map((project) => {
                      const projectOpen = expandedProjects.has(project.id) || !!query;
                      return <div className="folder-node" key={project.id}>
                        <div className={`tree-row folder-row ${selection.projectId === project.id && !selection.listId ? "is-active-parent" : ""}`}>
                          <button className="tree-chevron" onClick={() => setExpandedProjects((set) => { const next = new Set(set); next.has(project.id) ? next.delete(project.id) : next.add(project.id); return next; })}>{projectOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                          <button className="tree-main" onClick={() => onSelect({ spaceId: space.id, projectId: project.id, listId: null, folderId: null })}><FolderIcon size={17} /><span>{project.name}</span></button>
                          <button className="icon-button tree-add" title="New list" onClick={() => { setComposer({ type: "list", spaceId: space.id, projectId: project.id }); setExpandedProjects((set) => new Set(set).add(project.id)); }}><Plus size={14} /></button>
                          <ActionMenu items={[
                            { label: "Rename", icon: <Pencil size={18} />, onClick: () => rename("project", project.name, (name) => props.onRenameProject(space.id, project.id, name)) },
                            { label: "Archive project", icon: <Archive size={18} />, danger: true, onClick: () => window.confirm("Archive this project?") && props.onArchiveProject(space.id, project.id) },
                            { label: "Share & Permissions", icon: <Share2 size={18} />, dividerBefore: true, onClick: () => setModal({ type: "share-project", spaceId: space.id, projectId: project.id }) },
                            { label: "Move...", icon: <ArrowLeftRight size={18} />, onClick: () => setModal({ type: "move-project", spaceId: space.id, projectId: project.id }) },
                          ]} />
                        </div>

                        {projectOpen && <div className="tree-children list-children">
                          {project.lists.map((list) => {
                            const listOpen = expandedLists.has(list.id) || !!query;
                            return <div className="list-node" key={list.id}>
                              <div className={`tree-row list-row-level ${selection.listId === list.id && !selection.folderId ? "is-active-parent" : ""}`}>
                                <button className="tree-chevron" onClick={() => setExpandedLists((set) => { const next = new Set(set); next.has(list.id) ? next.delete(list.id) : next.add(list.id); return next; })}>{listOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
                                <button className="tree-main" onClick={() => onSelect({ spaceId: space.id, projectId: project.id, listId: list.id, folderId: null })}><span className="list-dot" /><span>{list.name}</span>{list.isPrivate && <Lock size={13} className="privacy-icon" />}</button>
                                <button className="icon-button tree-add" title="New folder" onClick={() => { setComposer({ type: "folder", spaceId: space.id, projectId: project.id, listId: list.id }); setExpandedLists((set) => new Set(set).add(list.id)); }}><Plus size={14} /></button>
                                <ActionMenu items={[
                                  { label: "Rename", icon: <Pencil size={18} />, onClick: () => rename("list", list.name, (name) => props.onRenameList(space.id, project.id, list.id, name)) },
                                  { label: list.isPrivate ? "Make public" : "Make private", icon: list.isPrivate ? <Globe2 size={18} /> : <Lock size={18} />, onClick: () => props.onToggleListPrivacy(space.id, project.id, list.id) },
                                  { label: "Share & Permissions", icon: <Share2 size={18} />, onClick: () => setModal({ type: "share-list", spaceId: space.id, projectId: project.id, listId: list.id }) },
                                  { label: "Move...", icon: <ArrowLeftRight size={18} />, onClick: () => setModal({ type: "move-list", spaceId: space.id, projectId: project.id, listId: list.id }) },
                                  { label: "Delete list", icon: <Trash2 size={18} />, danger: true, dividerBefore: true, onClick: () => confirmDelete("list", () => props.onDeleteList(space.id, project.id, list.id)) },
                                ]} />
                              </div>

                              {listOpen && <div className="tree-children folder-list-children">
                                {list.folders.map((folder) => <div className={`tree-row folder-leaf-row ${selection.folderId === folder.id ? "is-selected" : ""}`} key={folder.id}>
                                  <button className="tree-main" onClick={() => onSelect({ spaceId: space.id, projectId: project.id, listId: list.id, folderId: folder.id })}><FolderIcon size={16} /><span>{folder.name}</span>{folder.isPrivate && <Lock size={12} className="privacy-icon" />}</button>
                                  <ActionMenu items={[
                                    { label: "Rename", icon: <Pencil size={18} />, onClick: () => rename("folder", folder.name, (name) => props.onRenameFolder(space.id, project.id, list.id, folder.id, name)) },
                                    { label: folder.isPrivate ? "Make public" : "Make private", icon: folder.isPrivate ? <Globe2 size={18} /> : <Lock size={18} />, onClick: () => props.onToggleFolderPrivacy(space.id, project.id, list.id, folder.id) },
                                    { label: "Share & Permissions", icon: <Share2 size={18} />, onClick: () => setModal({ type: "share-folder", spaceId: space.id, projectId: project.id, listId: list.id, folderId: folder.id }) },
                                    { label: "Move...", icon: <ArrowLeftRight size={18} />, onClick: () => setModal({ type: "move-folder", spaceId: space.id, projectId: project.id, listId: list.id, folderId: folder.id }) },
                                    { label: "Delete folder", icon: <Trash2 size={18} />, danger: true, dividerBefore: true, onClick: () => confirmDelete("folder", () => props.onDeleteFolder(space.id, project.id, list.id, folder.id)) },
                                  ]} />
                                </div>)}
                                {composer?.type === "folder" && composer.spaceId === space.id && composer.projectId === project.id && composer.listId === list.id && <InlineComposer placeholder="Folder name" onSubmit={(name) => { props.onCreateFolder(space.id, project.id, list.id, name); setComposer(null); }} onCancel={() => setComposer(null)} />}
                              </div>}
                            </div>;
                          })}
                          {composer?.type === "list" && composer.spaceId === space.id && composer.projectId === project.id && <InlineComposer placeholder="List name" onSubmit={(name) => { props.onCreateList(space.id, project.id, name); setComposer(null); }} onCancel={() => setComposer(null)} />}
                        </div>}
                      </div>;
                    })}
                    {composer?.type === "project" && composer.spaceId === space.id && <InlineComposer placeholder="Project name" onSubmit={(name) => { props.onCreateProject(space.id, name); setComposer(null); }} onCancel={() => setComposer(null)} />}
                  </div>}
                </div>
              );
            })}
            {composer?.type === "space" && <InlineComposer placeholder="Space name" onSubmit={(name) => { props.onCreateSpace(name); setComposer(null); }} onCancel={() => setComposer(null)} />}
            {spaces.length === 0 && composer?.type !== "space" && (
              <div className="sidebar-empty-tree">No spaces yet. Use + above to create one.</div>
            )}
          </div>
        </div>
      </aside>

      {modal?.type === "share-space" && <SharePermissionsModal entityLabel="Space" permissions={findSpace(modal.spaceId).permissions} onChange={(permissions: SharePermission[]) => props.onSetSpacePermissions(modal.spaceId, permissions)} onClose={() => setModal(null)} />}
      {modal?.type === "share-project" && <SharePermissionsModal entityLabel="Project" permissions={findProject(modal.spaceId, modal.projectId).permissions} onChange={(permissions: SharePermission[]) => props.onSetProjectPermissions(modal.spaceId, modal.projectId, permissions)} onClose={() => setModal(null)} />}
      {modal?.type === "share-list" && <SharePermissionsModal entityLabel="List" permissions={findList(modal.spaceId, modal.projectId, modal.listId).permissions} onChange={(permissions: SharePermission[]) => props.onSetListPermissions(modal.spaceId, modal.projectId, modal.listId, permissions)} onClose={() => setModal(null)} />}
      {modal?.type === "share-folder" && <SharePermissionsModal entityLabel="Folder" permissions={findFolder(modal.spaceId, modal.projectId, modal.listId, modal.folderId).permissions} onChange={(permissions: SharePermission[]) => props.onSetFolderPermissions(modal.spaceId, modal.projectId, modal.listId, modal.folderId, permissions)} onClose={() => setModal(null)} />}
      {modal?.type === "move-project" && <MoveModal entityLabel="project" entityName={findProject(modal.spaceId, modal.projectId).name} destinations={projectDestinations(modal.spaceId)} onMove={(destination: string) => props.onMoveProject(modal.spaceId, modal.projectId, destination)} onClose={() => setModal(null)} />}
      {modal?.type === "move-list" && <MoveModal entityLabel="list" entityName={findList(modal.spaceId, modal.projectId, modal.listId).name} destinations={listDestinations(modal.spaceId, modal.projectId)} onMove={(destination: string) => props.onMoveList(modal.spaceId, modal.projectId, modal.listId, destination)} onClose={() => setModal(null)} />}
      {modal?.type === "move-folder" && <MoveModal entityLabel="folder" entityName={findFolder(modal.spaceId, modal.projectId, modal.listId, modal.folderId).name} destinations={folderDestinations(modal.spaceId, modal.projectId, modal.listId)} onMove={(destination: string) => props.onMoveFolder(modal.spaceId, modal.projectId, modal.listId, modal.folderId, destination)} onClose={() => setModal(null)} />}
    </>
  );
}
