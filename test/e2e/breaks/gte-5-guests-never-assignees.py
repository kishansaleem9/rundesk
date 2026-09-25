# A GUEST IS NEVER TAKEN FOR THE ASSIGNEE THEY ARE.
# Reddens: guest-task-edits: "on a task shared to comment and assigned to them a guest moves the status — read back — and does not rename it (403)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "  await assertSpaceAllowsTaskWrite(db, ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee, [\n"
b = "  await assertSpaceAllowsTaskWrite(db, ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee && membership.role !== 'guest', [\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('gte-5-guests-never-assignees: a guest is never taken for the assignee they are')
