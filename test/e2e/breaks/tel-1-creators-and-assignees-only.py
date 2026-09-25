# ONLY THE CREATOR, AN ASSIGNEE OR A MANAGER MAY CHANGE A TASK, as it was: a member with "edit" cannot touch a colleague's task.
# Re-aimed 25 September: the call passes the task's chain now (`project-roles-narrow-nothing`).
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Reddens: task-edit-levels: "a member with \"edit\" on the space changes a colleague's task there — its title and status, its assignees — and archives and deletes one"
#   or "a refusal names the space's level, not \"only assignees, creators, managers and admins\", which is no longer the rule"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "  await assertSpaceAllowsTaskWrite(db, ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee, [\n    { type: 'task', id: taskId },\n    { type: 'list', id: ctx.listId },\n    { type: 'project', id: ctx.projectId },\n    ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),\n  ])\n  return ctx\n}\n"
b = "  if (ctx.createdById !== actorId && !assignee) {\n    throw new ForbiddenException('Only assignees, creators, managers, and workspace admins can edit this task')\n  }\n  await assertSpaceAllowsTaskWrite(db, ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee, [\n    { type: 'task', id: taskId },\n    { type: 'list', id: ctx.listId },\n    { type: 'project', id: ctx.projectId },\n    ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),\n  ])\n  return ctx\n}\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tel-1-creators-and-assignees-only: creators and assignees only')
