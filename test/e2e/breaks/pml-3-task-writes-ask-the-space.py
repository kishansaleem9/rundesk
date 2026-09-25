# A TASK'S CHANGE ASKS THE SPACE ALONE, not a grant on its project.
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Reddens: project-member-levels: "a member given View on a project changes nothing in it — not the admin's task, not a new task, not a list, even one they made — where the space alone would let them, as it does in the project beside it"
#   or "a member given Comment on a project comments on its tasks and changes nothing of them"
#   or "a member given Edit on a project in a view-only space changes the admin's task there and makes one — and in the project beside it the space's View still decides"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = '  const resolved = await resolveSpaceLevel(db, { spaceId, actorId, within })\n'
b = '  const resolved = await resolveSpaceLevel(db, { spaceId, actorId, within: within.slice(within.length) })\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  await assertSpaceLevel(db, { spaceId, actorId, required: 'edit', kind: 'tasks', within })\n"
b = "  await assertSpaceLevel(db, { spaceId, actorId, required: 'edit', kind: 'tasks', within: within.slice(within.length) })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pml-3-task-writes-ask-the-space: task writes ask the space')
