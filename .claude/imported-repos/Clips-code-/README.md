# Clips 🎬

A **Loom / Cap-style screen recording & clip‑sharing app**, recreated from the
reference recording. Record your screen in the browser, get an instant
shareable link, and let people watch with captions, playback speed, and
comments.

- **Frontend:** React 18 + **Next.js 14** (App Router)
- **Backend:** **Next.js** route handlers (Node runtime)
- **Database:** **MySQL 8** (via `mysql2`)

---

## Features

| Area | What you get |
| --- | --- |
| **Dashboard** | Sidebar (All Clips / Video / Voice / **SyncUps** / **AI Notetaker**), top bar with a **working search**, "Welcome to Clips" onboarding, and a clips list with a **Sort** control and a **Gallery / List view toggle** (cards labelled by kind, e.g. "Video Clip · Just now"). |
| **SyncUp call** | `/call` — a call room that **auto-records** and, when you hang up, **saves the recording automatically** (to SyncUps, or to AI Notetaker with transcript/summary/action items when the AI Notetaker toggle is on). Started from a chat in the real product; SyncUps & AI Notetaker pages are recordings-only. |
| **Recorder** | `getDisplayMedia` + `MediaRecorder` screen capture **and** mic-only **voice** recording (a Screen/Voice toggle), resolution picker (720p / 1080p / 2K·4K "Upgrade" / Native), optional microphone, live timer, in‑browser preview, and an upload with a real progress bar. |
| **SyncUps** | Record a team sync call (tagged `syncup`); the clip page shows participants and the call transcript. |
| **AI Notetaker** | Meeting recordings (`meeting`) with an **AI Notes** panel — Summary / Transcript / Action items. (Transcript + summary are attached via the API by a transcription step; the live bot that joins Zoom/Meet/Teams is a server integration.) |
| **Search** | Top-bar search hits titles, summaries and transcripts (`/?q=` → `searchClips`). |
| **Clip page** | Custom video player (play/pause, scrubber, volume, **captions toggle**, **playback speed**, fullscreen, keyboard shortcuts), title, author, view count, **Copy link**, and **comments**. |
| **Clip actions** | Hover a card → **Rename**, **Download**, **Delete** (row + file). |
| **Backend** | REST route handlers backed by MySQL, video files streamed to `/public/uploads`. |

### Clip kinds

`clips.kind` is one of `video` (screen recording), `voice` (mic note), `syncup` (recorded call), `meeting` (AI Notetaker). Meetings/syncups carry optional `summary`, `participants`, `transcript` and `action_items` JSON columns, plus a flattened `transcript_text` for search.

## Screens ↔ routes

| Route | Purpose |
| --- | --- |
| `/` | Dashboard — onboarding or clips grid (`?kind=video` / `?kind=voice`) |
| `/record` | Screen / voice recorder → upload (`?kind=video\|voice\|syncup`) |
| `/call` | SyncUp call room → auto-records, auto-saves on hang-up |
| `/clip/[slug]` | Public share/watch page |

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/clips?kind=` | List clips by kind (`video`/`voice`/`syncup`/`meeting`) |
| `GET` | `/api/clips?q=` | Search titles, summaries and transcripts |
| `POST` | `/api/clips` | Create a clip (multipart: `video`, `title`, `duration`, `resolution`, `kind`; optional `summary`, `participants`, `transcript`, `actionItems` as JSON) |
| `GET` | `/api/clips/:slug` | Get one clip |
| `PATCH` | `/api/clips/:slug` | Rename (`{ title }`) |
| `DELETE` | `/api/clips/:slug` | Delete clip + file |
| `GET` | `/api/clips/:slug/comments` | List comments |
| `POST` | `/api/clips/:slug/comments` | Add a comment (`{ body, authorName? }`) |

---

## Getting started

### 1. Install

```bash
cd clips
npm install
```

### 2. Configure the database

Copy the example env and point it at your MySQL server:

```bash
cp .env.example .env.local
# edit DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
```

Create the schema (database + tables + a default author):

```bash
npm run db:setup          # runs db/schema.sql
# — or —
mysql -u root -p < db/schema.sql
```

### 3. Run

```bash
npm run dev
# http://localhost:3000
```

> **Recording needs a secure context.** Browsers only expose
> `getDisplayMedia` on `https://` or `http://localhost`, in Chrome/Edge/Firefox.

---

## How the pieces fit

```
Browser (React)                Next.js server            MySQL
──────────────                 ──────────────            ─────
Recorder.jsx                   /api/clips (POST)         clips
  getDisplayMedia + MediaRecorder ─►  saveVideoFile ─►   comments
  XHR upload w/ progress            ─►  createClip  ─►   users
VideoPlayer.jsx  ◄── /uploads/<slug>.webm (static)
Comments.jsx     ◄── /api/clips/:slug/comments
```

- **`src/lib/db.js`** — pooled `mysql2/promise` connection (cached across dev reloads).
- **`src/lib/clips.js`** — all SQL lives here as small, named functions.
- **`src/lib/storage.js`** — writes/removes the recorded `.webm` under `/public/uploads`.

## Notes & trade‑offs

- Video is stored on the local filesystem under `/public/uploads` (great for
  self‑hosting a Node server). For serverless/object storage, swap
  `src/lib/storage.js` for S3/R2 and keep the DB layer untouched.
- Auth is intentionally omitted — clips are attributed to a seeded default user.
  Add your provider of choice and set `author_id` in `POST /api/clips`.
- The 2K/4K resolutions are gated behind an "Upgrade" state to mirror the
  reference app's Business plan.
