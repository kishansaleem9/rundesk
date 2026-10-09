# A TASK EDIT ASKS NOTHING OF THE SPACE, as it did: an assignee changes status in "view only".
# Re-aimed 25 September: the call passes the task's chain now (`project-roles-narrow-nothing`).
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Re-aimed 9 October: the space check is written over several lines now, with the view-only switches beside it (`found-25-sep/view-only-individual-permissions`).
# Reddens: task-space-levels: "nor change the status of a task assigned to them (403, unchanged) — in an “edit” space they do"
#   or "in a “comment” space a member comments and changes the status of a task assigned to them — but not its title (403, unchanged)"
#   or "an assignee in a “comment” space may add a colleague to their task — in a “view only” space not (403, not added)"
#
# Re-aimed 9 October: the last 2 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  await assertSpaceAllowsTaskWrite(\n    db,\n    ctx.spaceId,\n    actorId,\n    opts.level ?? 'edit',\n    !!assignee,\n    [\n      { type: 'task', id: taskId },\n      { type: 'list', id: ctx.listId },\n      { type: 'project', id: ctx.projectId },\n      ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),\n    ],\n    opts.orViewOnly ? { workspaceId: ctx.workspaceId, permission: opts.orViewOnly } : undefined,\n  )\n  return ctx\n",
     '  return ctx\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsl-2-edits-ungated: a task edit asks nothing of the space')
