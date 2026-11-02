import { SetMetadata } from '@nestjs/common'

/*
 * A ROUTE THAT STILL ANSWERS FOR AN ARCHIVED WORKSPACE.
 *
 * `WorkspaceMemberGuard` refuses an archived workspace to everybody, as if it
 * were gone (`found-02-nov/archived-workspace-still-opens`): "Delete
 * Workspace" archives it, and its members must lose it at once (QA WS-018) —
 * the guard let them keep opening it by its address. The routes that act on
 * an archived workspace as one — restoring it, deleting it for good — say so
 * with this, and are the only ones that do.
 */
export const ALLOW_ARCHIVED_WORKSPACE = 'allow_archived_workspace'
export const AllowArchivedWorkspace = () => SetMetadata(ALLOW_ARCHIVED_WORKSPACE, true)
