# Rundesk Task Management — Standalone Functional Build

This is a clean, standalone Rundesk-style task-management interface built separately from the previous Rundesk Chat code.

It starts **empty**: there are no example projects, folders, lists, or tasks. Create your own data from the sidebar to test the full hierarchy.

## Included

- Workspace shell with Rundesk-inspired styling
- Create / rename / delete projects
- Create / rename / delete folders inside projects
- Create / rename / delete lists inside folders
- Create tasks inside lists
- Status groups: To do, In progress, In review, Complete
- List, Board, Table, and due-date views
- Task search, status filtering, sorting, and field toggles
- Right-side task drawer
- Editable task title, description, status, priority, dates, estimate, assignee, and tags
- Subtasks, checklists, dependencies, attachment metadata, comments, and activity
- Duplicate / delete task
- Browser persistence via `localStorage`

## Why localStorage in this first standalone build?

It makes the project immediately testable with no database configuration. Your created hierarchy and task data persist across refreshes in the same browser. Once this UI/interaction version is approved, the storage layer can be replaced with Prisma/MySQL without changing the core component structure.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Test flow

1. Click **New project**.
2. Hover your project and click **+** to create a folder.
3. Hover the folder and click **+** to create a list.
4. In the selected list, add a task.
5. Click the task to open the large details drawer.
6. Change status / priority / dates, add tags, subtasks, checklist items, comments, etc.
7. Refresh the page — your local data remains.

## Reset

Delete items through their menus, or clear the browser key:

`rundesk-task-workspace-v1`
