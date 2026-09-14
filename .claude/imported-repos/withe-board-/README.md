# TaksamBoard — Whiteboard app (Next.js + React + MySQL)

An infinite-canvas whiteboard, in the TaksamAI style, that recreates the tool
shown in the reference video: a template gallery plus a full editor with
shapes, text (4 font families), connectors/arrows, freehand pen, sticky notes,
task cards, frames, a laser pointer, pan/zoom, export and share.

- **Frontend:** React (Next.js App Router)
- **Backend:** Next.js Route Handlers (`/app/api/**`)
- **Database:** MySQL (one `boards` table; the document is stored as `JSON`)

> **Live demo (no setup):** a self-contained build of the same editor runs as a
> Claude Artifact — see the link shared in chat. This repo is the real
> Next.js + MySQL version you run and deploy.

---

## Features (every tool from the video)

| Area | What works |
|------|-----------|
| Templates | Start from scratch, Org Chart, Flow Chart, Customer Journey Map, Action Plan, Root Cause Analysis, Brainstorm |
| Shapes | Rectangle, rounded-rect, ellipse, triangle, diamond, hexagon, star, cylinder, cloud, parallelogram |
| Text | Inline editing · fonts (Sans / Serif / Mono / Handwritten) · size · bold · italic · align · color |
| Connectors | Straight / elbow / curved · arrowheads on either end · solid / dashed / dotted · **snap to shapes** (follow when moved) |
| Freehand | Pen with color + width; eraser; laser pointer |
| Sticky notes & tasks | 6 note colors; task cards with status |
| Frames | Labeled containers |
| Canvas | Infinite pan (Space/drag/hand) · zoom (wheel + buttons + fit) · dotted grid |
| Editing | Multi-select · marquee · move · 8-handle resize · duplicate · layer order · opacity · undo/redo |
| Files | Export **PNG** & **JSON**, Share link, light/dark theme |
| Shortcuts | V H R O T L P N F E · Del · Ctrl/⌘+Z/Y/A/D/S · arrows to nudge |

The canvas engine lives in [`lib/whiteboard-engine.js`](lib/whiteboard-engine.js)
— a single framework-agnostic module. The React app mounts it in
[`components/WhiteboardEditor.jsx`](components/WhiteboardEditor.jsx) and wires it
to the MySQL API for persistence.

---

## Quick start

### 1. Prerequisites
- Node.js 18.17+ (Node 20+ recommended)
- A MySQL 5.7+ / MySQL 8 server (or MariaDB 10.4+)

### 2. Install
```bash
cd whiteboard
npm install
```

### 3. Configure the database
Copy the example env file and fill in your MySQL credentials:
```bash
cp .env.example .env
```
```env
# .env  — either a URL…
DATABASE_URL="mysql://user:password@127.0.0.1:3306/taksam_whiteboard"
# …or discrete vars (used when DATABASE_URL is unset)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=taksam_whiteboard
```

### 4. Create the schema
Either run the helper (creates the database + table):
```bash
npm run db:init
```
…or apply the SQL by hand:
```bash
mysql -u root -p < db/schema.sql
```
> The app also **auto-creates** the `boards` table on first request, so
> `db:init` is optional if the database itself already exists.

### 5. Run
```bash
npm run dev      # http://localhost:3000
```
Production:
```bash
npm run build && npm start
```

---

## API

| Method | Route | Body | Purpose |
|--------|-------|------|---------|
| `GET`  | `/api/boards` | – | List boards (with docs for thumbnails) |
| `POST` | `/api/boards` | `{ title, templateName, accent, doc }` | Create a board → `{ id }` |
| `GET`  | `/api/boards/:id` | – | Fetch one board |
| `PUT`  | `/api/boards/:id` | `{ title, doc }` | Save a board |
| `DELETE` | `/api/boards/:id` | – | Delete a board |

The editor autosaves ~0.5s after each change via `PUT`.

## Data model

```sql
boards(
  id            VARCHAR(40) PRIMARY KEY,
  title         VARCHAR(255),
  template_name VARCHAR(120),
  accent        VARCHAR(20),
  doc           JSON,          -- { title, elements[], camera{x,y,zoom} }
  created_at    TIMESTAMP,
  updated_at    TIMESTAMP
)
```

Each element in `doc.elements` is one shape/note/text/connector/stroke with its
geometry and style. See the factories in `lib/whiteboard-engine.js`.

---

## Project layout

```
whiteboard/
├─ app/
│  ├─ layout.jsx                 # fonts + <html data-theme>
│  ├─ globals.css                # dashboard theme tokens (editor styles are self-injected)
│  ├─ page.jsx                   # dashboard route
│  ├─ board/[id]/page.jsx        # editor route
│  └─ api/boards/…               # CRUD route handlers
├─ components/
│  ├─ Dashboard.jsx              # template gallery + board list (client)
│  └─ WhiteboardEditor.jsx       # mounts the engine, wires autosave (client)
├─ lib/
│  ├─ whiteboard-engine.js       # the whole canvas editor (framework-agnostic)
│  └─ db.js                      # mysql2 pool + schema bootstrap
├─ db/schema.sql
└─ scripts/init-db.mjs
```

## Notes & next steps
- **Auth / multi-workspace** is not included — boards are global. Add a `user_id`
  column + your auth of choice to scope them.
- **Realtime multiplayer** (shared cursors/live edits) is a natural extension —
  the engine already serializes a full document you can broadcast over WebSockets.
- Deploy anywhere that runs Node + reaches MySQL (Vercel + PlanetScale/RDS, a VPS, Docker, etc.).
