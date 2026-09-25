# A TASK EDIT ASKS NOTHING OF THE SPACE, as it did: an assignee changes status in "view only".
# Re-aimed 25 September: the call passes the task's chain now (`project-roles-narrow-nothing`).
# Reddens: task-space-levels: "nor change the status of a task assigned to them (403, unchanged) — in an “edit” space they do"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertSpaceAllowsTaskWrite(ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee, [\n      { type: 'task', id: taskId },\n      { type: 'list', id: ctx.listId },\n      { type: 'project', id: ctx.projectId },\n      ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),\n    ])\n    return ctx\n"
b = '    return ctx\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsl-2-edits-ungated: applied")
