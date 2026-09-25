# A TASK'S CHANGE ASKS NOTHING OF ITS SPACE: comment-only and view-only spaces take every edit.
# Re-aimed 25 September: the call passes the task's chain now (`project-roles-narrow-nothing`).
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Reddens: task-edit-levels: "a comment-only space lets a member change nothing of a colleague's task, and on a task assigned to them its status alone"
#   or "a view-only space lets a member change nothing, even on a task assigned to them"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "  await assertSpaceAllowsTaskWrite(db, ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee, [\n    { type: 'task', id: taskId },\n    { type: 'list', id: ctx.listId },\n    { type: 'project', id: ctx.projectId },\n    ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),\n  ])\n  return ctx\n}\n"
b = "  if (actorId === '') await assertSpaceAllowsTaskWrite(db, ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee, [\n    { type: 'task', id: taskId },\n    { type: 'list', id: ctx.listId },\n    { type: 'project', id: ctx.projectId },\n    ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),\n  ])\n  return ctx\n}\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tel-3-space-level-not-asked: the space level is not asked')
