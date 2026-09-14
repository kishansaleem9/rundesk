# Teams-Pulse — Team Management Interface

A **ClickUp-style "Teams" interface** you can hand to **any company**. It ships
**empty** — a new company signs in and builds its own org: **add people**,
**invite by email**, **create teams**, **add members**, and set **who reports to
whom**. Screens: **All Teams**, **All People** (grid/list, filters, invite,
export, detail panel), an interactive **Org Chart** with manager assignment,
**Analytics** (who's online + what they're focused on), and per-team **Overview /
Analytics / Priorities / Team / Team Chart / StandUp / Workload / Timesheet** tabs.

- **Frontend:** React + **Next.js** (App Router)
- **Backend:** **Next.js** Route Handlers (`app/api/**`)
- **Database:** **MySQL** (via `mysql2`)

> **Starts empty on purpose.** There is no demo/company data baked in. Use the
> in-app **Add Person / Create Team / Add member** buttons to enter your own.
> Set your company name with the `WORKSPACE_NAME` env var.

---

## Quick start

### Option A — run instantly (no database)

```bash
cd teams-pulse
npm install
npm run dev            # open http://localhost:3000
```

With no MySQL configured, data is kept **in memory** (it resets when the server
restarts). Great for trying it out — click **Add Person** to begin. For data
that persists, use MySQL below.

### Option B — run with MySQL (persistent)

1. Create `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   ```ini
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=teams_pulse
   WORKSPACE_NAME=Acme Inc.      # your company name (shown in the sidebar)
   ```

2. Create the (empty) schema:

   ```bash
   npm run db:setup
   ```

3. Start the app and add your people & teams in the UI:

   ```bash
   npm run dev
   ```

Every add/edit now writes to MySQL (e.g. adding a person runs an `INSERT`,
assigning a manager runs an `UPDATE people SET manager_id = ?`).

---

## What you can do

| Action | Where | What happens |
|--------|-------|--------------|
| **Add a person** | All People → *Add Person* | Name, title, email, **account type** (Admin / Member / Limited Member / Guest / AI Agent), status, manager, and an "owner/CEO" flag |
| **Invite people** | All People → *Invite* | Enter one or more emails + a role; they're added to the directory (like an accepted invite link) |
| **Filter / view people** | All People | Filter by Status / Team / Account type / Manager / Sort, search, and switch **grid ⇄ list**; click a person for a **detail panel** (email, local time, reports-to, teams, direct reports, priorities) |
| **Export people** | All People → *Export* | Copy or download the directory as CSV |
| **See who's online** | Analytics | Filters (Status / Team / Account type / Manager / Item type), day navigation, an hourly online chart, and per-person **Focused on** breakdown |
| **Create a team** | All Teams → *Create Team* | Auto handle + color; group your people |
| **Add / remove members** | Team → *Team* tab | Pick people from your directory; set role (Lead / Manager / Member) |
| **Set who reports to whom** | Org Chart → click a person → *Reports to* | Builds the hierarchy live; blocks cycles |
| **Team note + Bookmarks** | Team → *Overview* | Edit and save a team note; add/remove link bookmarks |
| **Priority tasks** | Team → *Priorities* | Add tasks per member; tick to complete; delete |
| **Plan work** | Team → *Workload* | Tasks laid out by assignee × day, plus a Backlog |
| **StandUp** | Team → *StandUp* | Auto summary of each member's Done / In-progress / To-do |
| **Delete** | hover a person or team card | Removes it (FKs clean up memberships) |

### Team tabs
Each team has: **Overview** (note, bookmarks, feed, members) · **Analytics** (who's online) · **Priorities** (per-member tasks) · **Team** (members) · **Team Chart** · **StandUp** · **Workload** · **Timesheet**.

## Project structure

```
teams-pulse/
├─ app/
│  ├─ (app)/                 # shell (sidebar + top bar)
│  │  ├─ teams/…             # All Teams + team detail (tabs)
│  │  ├─ people/…            # All People + Add Person
│  │  ├─ org-chart/…         # Org Chart (tree + person panel)
│  │  └─ analytics/…         # Analytics
│  ├─ api/                   # REST route handlers (the backend)
│  ├─ globals.css            # dark theme
│  └─ layout.jsx
├─ components/               # Avatar, Sidebar, Modal, PersonPanel, …
├─ lib/
│  ├─ db.js                  # MySQL pool + mock-mode switch
│  ├─ repo.js                # data access + create/delete/member mutations
│  └─ mock.js                # empty in-memory store + helpers
├─ db/schema.sql             # MySQL DDL
├─ scripts/setup-db.mjs      # create the schema
└─ demo/index.html           # standalone single-file demo (no setup, saves to your browser)
```

## API endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET / POST | `/api/people` | List people · **create / invite** a person (`{ name, email, role, kind, status, manager_id, is_ceo }`) |
| GET / DELETE | `/api/people/:id` | Read · **delete** a person |
| PUT | `/api/people/:id/manager` | Assign / clear a manager |
| GET / POST | `/api/teams` | List teams · **create** a team |
| GET / DELETE | `/api/teams/:id` | Team detail · **delete** a team |
| POST / DELETE | `/api/teams/:id/members` | **Add** / **remove** a member (`{ personId, role }`) |
| PUT | `/api/teams/:id/note` | Save the team note |
| POST / DELETE | `/api/teams/:id/bookmarks` | Add / remove a bookmark |
| POST | `/api/tasks` | Create a task (`{ team_id, assignee_id, title, status, due_date, is_priority }`) |
| PATCH / DELETE | `/api/tasks/:id` | Update (status, assignee, …) / delete a task |
| GET | `/api/org-chart?agents=0\|1` | Org hierarchy tree |
| GET | `/api/analytics` | People with online status, teams, managers, and each person's **Focused on** breakdown |

## Notes

- Avatars are rendered from initials + a per-person color — no image hosting.
- The org chart treats people flagged "Top of organization" as roots; people
  with no manager show in a **No manager** column, ready to be assigned.
- `demo/index.html` is a self-contained build (no Node/MySQL) that saves your
  entered data in the browser's `localStorage` — handy for a quick look.
