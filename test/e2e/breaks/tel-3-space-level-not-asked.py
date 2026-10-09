# A TASK'S CHANGE ASKS NOTHING OF ITS SPACE: comment-only and view-only spaces take every edit.
# Re-aimed 25 September: the call passes the task's chain now (`project-roles-narrow-nothing`).
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Re-aimed 9 October: the space check is written over several lines now, with the view-only switches beside it (`found-25-sep/view-only-individual-permissions`).
# Reddens: task-edit-levels: "a comment-only space lets a member change nothing of a colleague's task, and on a task assigned to them its status alone"
#   or "a view-only space lets a member change nothing, even on a task assigned to them"
#   or "a refusal names the space's level, not \"only assignees, creators, managers and admins\", which is no longer the rule"
#
# Re-aimed 9 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  await assertSpaceAllowsTaskWrite(\n    db,\n    ctx.spaceId,\n',
     "  if (actorId === '') await assertSpaceAllowsTaskWrite(\n    db,\n    ctx.spaceId,\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("tel-3-space-level-not-asked: a task's change asks nothing of its space")
