/**
 * THE WORKSPACE'S ROLE LISTS, EACH STATED ONCE (`role-lists-copied-per-module`).
 *
 * Who manages a workspace was an array literal in nine places, who administers
 * it in eight, and who may be given a role in it in four. They were identical
 * the day each was written, which is how `views.service`'s copy drifted into
 * naming roles that do not exist (`owner`, `admin`) before anybody noticed, and
 * how `space-default-permission` came to restate one on purpose "so a change to
 * one is a deliberate change to the other" — the one thing a single list makes
 * true by itself. `scripts/check-role-lists.mjs` fails on a new array literal
 * of workspace role names anywhere in the API outside this directory.
 *
 * `super_admin` is a platform role. No membership row holds it (no path writes
 * one); the member guards put it on the request for a platform admin, which is
 * where these sets meet it.
 */

/** Everybody who manages the workspace: its admins, its managers, the platform's admins. */
export const WS_MANAGER_ROLES = ['workspace_admin', 'manager', 'super_admin'] as const

/** Its administrators alone — a manager is not one. */
export const WS_ADMIN_ROLES = ['workspace_admin', 'super_admin'] as const

/** The roles a person may be given in a workspace, by an admin or an invitation; never the platform's own. */
export const ASSIGNABLE_WORKSPACE_ROLES = ['workspace_admin', 'manager', 'member', 'guest'] as const
export type AssignableWorkspaceRole = (typeof ASSIGNABLE_WORKSPACE_ROLES)[number]

const inSet = (set: readonly string[], role: unknown) => typeof role === 'string' && set.includes(role)

export function isManagerRole(role: string | null | undefined): boolean {
  return inSet(WS_MANAGER_ROLES, role)
}

export function isAdminRole(role: string | null | undefined): boolean {
  return inSet(WS_ADMIN_ROLES, role)
}

export function isAssignableWorkspaceRole(role: unknown): role is AssignableWorkspaceRole {
  return inSet(ASSIGNABLE_WORKSPACE_ROLES, role)
}

/**
 * How the base roles stand to one another. A grant never reaches past its
 * giver's own rank: nobody makes, adds or removes somebody above themself
 * (`managers-grant-themselves-admin`). The permission catalog's cascade is
 * built on the same order.
 */
export const WORKSPACE_ROLE_RANK: Readonly<Record<'guest' | 'member' | 'manager' | 'workspace_admin' | 'super_admin', number>> = {
  guest: 0,
  member: 1,
  manager: 2,
  workspace_admin: 3,
  super_admin: 4,
}

/** A role's rank; -1 for anything that is not a workspace role. */
export function roleRank(role: string | null | undefined): number {
  return role && Object.prototype.hasOwnProperty.call(WORKSPACE_ROLE_RANK, role)
    ? WORKSPACE_ROLE_RANK[role as keyof typeof WORKSPACE_ROLE_RANK]
    : -1
}
