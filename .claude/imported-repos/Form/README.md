# ClickUp-style Form Builder & Submission System

A 1:1 functional replica of ClickUp's Form Builder.

- **Frontend:** React + Next.js (App Router)
- **Backend:** Next.js (Server Actions + a Route Handler)
- **Database:** MySQL

Build a form from a template (or from scratch), map each field to a task
property, publish it, and share the public link. Every submission atomically
creates a **submission** row **and** a **task** in the target List — shown on a
Kanban board with **List / Board / Form** views.

---

## Requirements

- Node.js 18+
- A MySQL 8+ (or MariaDB 10.5+) database

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create a database and point the app at it.
#    Copy .env.example to .env and set your connection string:
cp .env.example .env
#    .env:
#    DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/clickup_forms"

# 3. Create the tables
npm run db:init

# 4. (optional) seed one example Space / List / published form
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open **http://localhost:3000/forms**.

## How it works

| Path | What it is |
| --- | --- |
| `/forms` | Hub — template gallery + your forms (create / delete) |
| `/forms/[id]` | The 3-tab builder: **Build** (canvas + task-property mapping), **Settings**, **Preview** |
| `/board/[listId]` | Kanban board — groups, drag to move, add/rename/delete groups, task menu |
| `/list/[listId]` | Same tasks as a grouped list |
| `/f/[publicId]` | The public form anyone can submit |
| `/api/forms/[formId]/submit` | Submit endpoint — inserts a submission **and** a task in one transaction |

### Field → task mapping
In the builder, each field can map to `task_name`, `description`, `assignee`,
`priority`, `due_date`, `tags`, `status`, or a custom field. On submit, the
answers flow into the generated task automatically (see `src/lib/mapping.js`).

### Database
`db/schema.sql` — the hierarchy is **spaces → folders → lists → tasks**, plus
`forms`, `form_fields`, and `form_submissions`. A form must always target a
space, folder, or list (enforced by a CHECK constraint).

## Tech
Next.js 14 · React 18 · Tailwind CSS 3 · lucide-react · react-hook-form · mysql2.

## Project layout

```
src/
  app/            routes (App Router) + the submit API route
  components/     builder, Board, ViewTabs, PublicForm, shell, ui, icons
  lib/            db (mysql2 pool + transactions), data (reads),
                  actions (Server Actions), mapping, templates, fieldTypes
db/schema.sql     MySQL schema
scripts/          init-db (create tables), seed (example data)
```
