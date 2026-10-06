import type { SpaceDefaultPermission, ViewVisibility } from '@rundesk/db'

/**
 * WHO MAY CHANGE WHAT A LIST'S READERS SHARE — its saved views
 * (`found-5-oct/readers-change-shared-views`).
 *
 * A view whose visibility is "everyone" or "protected" belongs to the list: it
 * is in every reader's tab strip, and the default one is what the list opens
 * on for all of them. Any reader of the list made, renamed, reconfigured,
 * pinned, re-defaulted and deleted them — a member of a view-only space and a
 * guest with a view share alike (measured 5 October), while the same member
 * was refused a change to a task's title on that list. Every view the shared
 * rule let through was "what every view was before this existed", and the
 * view-only reader had been left out of the question.
 *
 * ClickUp (help centre, read through search excerpts):
 *   · "Views feature availability and limits": "To create views, you must have
 *     Edit or Full edit permissions to the List, Subfolder, Folder, or Space
 *     where the view is created."
 *   · "Manage individual permissions for view only users": view-only users and
 *     guests have four individual permissions, and "Add/remove tags and create
 *     views are deactivated by default." (The switches themselves are unbuilt:
 *     `found-25-sep/view-only-individual-permissions`.)
 *   · "Permissions in detail": Edit "permits the person to make changes to a
 *     location or item"; Comment, "to add and reply to comments"; View only is
 *     "read-only access".
 *   · "Protect a view" and "Create and share a private view": a person given
 *     Full edit on a view "can save changes, protect and unprotect, share, and
 *     delete the view"; Limited "can only view, duplicate, and favorite the
 *     view".
 *
 * So every write to a SHARED view — making one, its name, its layout, its pin,
 * the list's default, who sees it, deleting it — asks a level through the
 * resolver every write rule reads (`resolveSpaceLevel`), the most specific
 * grant first. For a view that exists that is the level ON THE VIEW: a share
 * on the view itself, then the list, its project, its folder, the space — the
 * chain `SharesService.locate` gives a view, which its share panel already
 * read while the write rule did not, so a member held to View on one view
 * renamed and deleted it, and one given Full edit on a view of a view-only
 * list was refused it (`levelOnView`). Making a view, making a private one
 * shared and choosing the list's default are writes to the LIST, and ask its
 * level. A PRIVATE view stays its maker's at any level: nobody else sees it,
 * so it changes nothing anybody else sees. A protected view keeps its own rule
 * on top of the level: its maker and the workspace's managers.
 */
export const SHARED_VIEW_LEVEL: SpaceDefaultPermission = 'edit'

/**
 * DELETING A SHARED VIEW ASKS FULL EDIT, as deleting asks it of a task and a
 * location here (`task-write.ts`, `container-access.ts`: Edit changes, Full
 * edit deletes). ClickUp's "Delete a view": "Guests with Full access to a
 * Folder, Subfolder, or List can delete views in it"; its "Permissions in
 * detail": Edit "isn't able to delete the location or item". A view is deleted
 * for good — there is no Trash for it — the list's default as well: asked
 * Edit, a member refused trashing a task in the list deleted its default view
 * (measured on lane 6, 5 October).
 */
export const SHARED_VIEW_DELETE_LEVEL: SpaceDefaultPermission = 'admin'

export type ViewActor = { id: string; role?: string }

/** What a write to one of a list's views needs to know of the actor (`ViewsService.writeFacts`). */
export type ViewWriteFacts = {
  /** Their level on this view (`levelOnView`) reaches `SHARED_VIEW_LEVEL`, or no space setting narrows them. */
  reachesLevel: boolean
  /** Their level on this view reaches `SHARED_VIEW_DELETE_LEVEL`, which deleting it asks. */
  reachesDelete: boolean
  /** Their level on the LIST reaches `SHARED_VIEW_LEVEL`: what adding a shared view to it, and its default, ask. */
  listReachesLevel: boolean
  /** A workspace admin or manager: a protected view answers to them too. */
  manager: boolean
}

type ViewRow = { visibility: ViewVisibility; createdById: string | null; isDefault?: boolean | null }

/**
 * THE LEVEL ON A VIEW, from the level along its list's chain (`resolveSpaceLevel`
 * with the list, its project and its folder) and the actor's own share on the
 * view. The view is the most specific step, so its share decides first, in
 * either direction, as a share on a task decides before its list's. A manager
 * is never narrowed (`workspace-role`), and nothing resolved — somebody no space
 * setting narrows — stays nothing. One list read asks the list once and every
 * view's share in one query; one write asks `resolveSpaceLevel` with the view
 * in front of the chain, and the two answer alike.
 */
export function levelOnView(
  onList: { level: SpaceDefaultPermission; source: string } | null,
  viewShare: SpaceDefaultPermission | null,
): SpaceDefaultPermission | null {
  if (!onList) return null
  if (onList.source === 'workspace-role') return onList.level
  return viewShare ?? onList.level
}

/**
 * What bars this actor from changing (or, `act` 'delete', deleting) this view,
 * or null when nothing does:
 *
 *   'private'   somebody else's private view — its maker's alone;
 *   'level'     a shared view, where their level on it is below Edit (Full
 *               edit, to delete it);
 *   'protected' a protected view, and they are neither its maker nor a manager.
 */
export function viewWriteBar(
  view: ViewRow,
  actor: ViewActor,
  facts: ViewWriteFacts,
  act: 'change' | 'delete' = 'change',
): 'private' | 'level' | 'protected' | null {
  if (actor.role === 'super_admin') return null
  const mine = view.createdById === actor.id
  if (view.visibility === 'private') return mine ? null : 'private'
  if (!(act === 'delete' ? facts.reachesDelete : facts.reachesLevel)) return 'level'
  if (view.visibility === 'protected' && !mine && !facts.manager) return 'protected'
  return null
}

/**
 * WHAT THE LIST PAGE MAY OFFER ON THIS VIEW — the answers its writes give, so
 * its menu and its Customize panel draw nothing the server would refuse:
 *
 *   mayChange           Update, Rename and Pin;
 *   mayDelete           Delete — Full edit on the view, or its maker's own
 *                       private view;
 *   mayMakeDefault      Make default — never a private view, which the list's
 *                       default cannot be (everybody lands on the default),
 *                       and the list's own level besides;
 *   mayChangeVisibility Protect view, and Private view off — its maker's or a
 *                       manager's, and making a private view shared is a write
 *                       to the list's shared views, so it asks the list too;
 *   mayMakePrivate      Private view on — not on the list's default, which the
 *                       server refuses (400) for the same reason.
 */
export function viewOffers(view: ViewRow, actor: ViewActor, facts: ViewWriteFacts) {
  const superAdmin = actor.role === 'super_admin'
  const mayChange = viewWriteBar(view, actor, facts) === null
  const ownerOrManager = superAdmin || view.createdById === actor.id || facts.manager
  const onList = superAdmin || facts.listReachesLevel
  const mayChangeVisibility = mayChange && ownerOrManager && (view.visibility !== 'private' || onList)
  return {
    mayChange,
    mayDelete: viewWriteBar(view, actor, facts, 'delete') === null,
    mayMakeDefault: mayChange && view.visibility !== 'private' && onList,
    mayChangeVisibility,
    mayMakePrivate: mayChangeVisibility && view.visibility !== 'private' && !view.isDefault,
  }
}
