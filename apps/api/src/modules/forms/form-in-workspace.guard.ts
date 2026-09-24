import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { forms, formFields } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isUuid } from '../../common/validation/uuid'

/**
 * A FORM IS ITS WORKSPACE'S: every route that names one, or a field of one, is
 * answered only through that workspace. (A submission's routes find it under
 * its form themselves.)
 *
 * The routes took the ids alone. `WorkspaceMemberGuard` checked the caller's
 * membership of the workspace in the PATH, and the service then acted on
 * whatever form the id named: measured on lane 1, a user of another
 * organisation read a form and the submissions strangers had typed into it,
 * renamed it, gave it a field, copied and archived it, all through a workspace
 * of their own; and a field was relabelled or deleted by its own id, under
 * any form (`found-24-sep/forms-open-across-workspaces`).
 *
 * Not found, not forbidden, for each: whether a form of another workspace
 * exists is not this caller's to learn. And a GUEST has no form — none can be
 * shared with them — so a guest is listed none (the list asks the service) and
 * refused every other route.
 *
 * Runs after `WorkspaceMemberGuard`, which has put the caller's membership on
 * the request.
 */
@Injectable()
export class FormInWorkspaceGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const { workspaceId, formId, fieldId } = (req.params ?? {}) as Record<string, string | undefined>
    const role = (req.workspaceMember as { role?: string } | undefined)?.role

    if (role === 'guest' && ctx.getHandler().name !== 'list') throw new ForbiddenException('Guests have no forms')

    if (formId) {
      if (!isUuid(formId) || !workspaceId) throw new NotFoundException('Form not found')
      const [form] = await this.db
        .select({ id: forms.id })
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.workspaceId, workspaceId)))
        .limit(1)
      if (!form) throw new NotFoundException('Form not found')
    }
    if (fieldId) {
      if (!formId || !isUuid(fieldId)) throw new NotFoundException('Field not found')
      const [field] = await this.db
        .select({ id: formFields.id })
        .from(formFields)
        .where(and(eq(formFields.id, fieldId), eq(formFields.formId, formId)))
        .limit(1)
      if (!field) throw new NotFoundException('Field not found')
    }
    // A submission's own routes each find it under its form already (retry, its
    // history, its files), so it is not asked twice here.
    return true
  }
}
