# Share & Permissions — build spec

Source of truth for task #126. Derived from the client's "Sharing and Permissions
UI" recording (23 Jul 2026) plus ClickUp's own permissions documentation, which
the client opened on camera as the reference they want matched.

## What the client asked for (from the recording)

1. **"Share & Permissions" on every object** — space, folder, project, list,
   task, sub-task and chat conversation. Today only a folder offers
   Make Private / Make Public.
2. **Share by email**, including **people outside the workspace**.
3. **Per-person access level** — view-only vs editable.
4. Ask for an access level **even when the object is made public**.
5. The chosen level must be **visible per person** on every object.

## ClickUp's model (the reference)

### The four levels

| Level | Intent |
|---|---|
| **Full edit** | Everything, *including deleting the item itself* |
| **Edit** | Change content, but **cannot delete the item** it is granted on |
| **Comment** | Read + comment only |
| **View only** | Read only |

Rundesk already has this shape: `container_role` is
`admin | edit | comment | view` (see `packages/db/src/schema/enums.ts`).
Map **ClickUp "Full edit" → our `admin`**; the other three match by name.

### Rules that shape the implementation

- **Most specific wins.** Task-level permission overrides list-level, which
  overrides folder/subfolder, which overrides space. Resolution must walk the
  chain from the item upward and stop at the first explicit grant.
- **Public locations default to full edit** for members/admins/owner. A grant is
  only needed to *narrow* access or to open a *private* item to someone.
- **Edit ≠ can share.** A member with `edit` on a folder may share it; a guest
  may **never** share, even with edit. So "can share" is a function of
  (level, user type), not level alone.
- **Guests/outsiders start with nothing.** They see only what has been
  explicitly shared with them.
- **Spaces cannot be shared with guests** (space-level grants are an
  Enterprise-tier feature in ClickUp). Folder/list/task grants are the norm.
- **Private items cannot be made public by link** — except docs and views, which
  do support public links. Our existing doc public-share already matches this.

### Outsider invite flow

In the share modal, typing a **full email address** into the invite field
invites that person, choosing a **user role** *and* a **permission level** in the
same step. That single input covers both existing members and outsiders — the
client's ask #2.

## Implementation notes for Rundesk

### Chat conversations

Channels have their own membership table, so a grant has to interact with it
carefully:

- A grant on the **channel itself** is the only kind that opens a private
  channel. A space-level grant must NOT inherit down to channels, or every
  private channel in a space becomes visible to anyone who can see the space.
- The **grant wins over membership**. Opening a channel upserts a member row
  (read/delivery markers), so letting membership win would silently promote a
  view-only visitor to full posting rights on their second request.
- A share-only visitor **never gets a member row**, and cannot `join`. Membership
  outlives the grant, so either would survive revocation. The cost is that their
  read/delivery markers go untracked — a fair trade for revocation that revokes.
- `view` is genuinely read-only: posting and attachment upload are refused.
- **DMs cannot be shared** at all.

- **Generic grants table** (`object_shares`): `(objectType, objectId, userId |
  invitedEmail, level, createdById, createdAt)` with a unique index per
  (objectType, objectId, principal). `objectType` covers
  `space | folder | project | list | task | doc | channel` so one table serves
  every surface instead of adding a members table per entity. Keep the existing
  `space_members` / `project_members` working (read both, or migrate them in).
- **Pending invites**: a row with `invitedEmail` and no `userId` is an outsider
  who hasn't accepted; bind it to the user on signup/accept.
- **Resolution helper** next to `common/permissions/item-visibility.ts`, so the
  existing privacy filters and the new levels resolve in one place. Every read
  path already funnels through those helpers — reuse them rather than adding a
  second enforcement layer.
- **One `SharePanel` component** parameterised by object type, opened from a
  "Share & Permissions" entry in each object's ⋯ menu (matching where ClickUp
  puts it — bottom of the context menu). Reuse the existing
  `container-members-sheet.tsx` role picker; it already renders all four levels.
- **Making something public must prompt for the level** granted to the people it
  is shared with (ask #4) — a select in the same panel, not a separate flow.
- Enforce `edit` cannot delete: the `action: 'delete'` path in
  `assertCanManageContainer` already distinguishes manage vs delete, so wire the
  level into that call rather than inventing new checks.

## Sources

- [Permissions in detail](https://help.clickup.com/hc/en-us/articles/6309221065495-Permissions-in-detail)
- [Intro to permissions](https://help.clickup.com/hc/en-us/articles/6309225399703-Intro-to-permissions)
- [Set permissions on individual locations](https://help.clickup.com/hc/en-us/articles/31233419651607-Set-permissions-on-individual-locations)
- [Share Spaces, Folders, Subfolders, Lists, and tasks](https://help.clickup.com/hc/en-us/articles/6309266954263-Share-Spaces-Folders-Subfolders-Lists-and-tasks)
- [Make Spaces, Folders, Subfolders, Lists, and tasks private](https://help.clickup.com/hc/en-us/articles/7255448709655-Make-Spaces-Folders-Lists-and-tasks-private)
- [Share locations and items with a public link](https://help.clickup.com/hc/en-us/articles/6309298874775-Share-locations-and-items-with-a-public-link)
- [Guest-type user roles](https://help.clickup.com/hc/en-us/articles/6310022323991-Guest-type-user-roles)
- [Invite people to your Workspace](https://help.clickup.com/hc/en-us/articles/6310498173079-Invite-people-to-your-Workspace)
- [Permissions FAQ](https://help.clickup.com/hc/en-us/articles/23286809224471-Permissions-FAQ)
