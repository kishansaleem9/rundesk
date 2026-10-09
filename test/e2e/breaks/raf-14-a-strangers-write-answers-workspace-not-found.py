# SOMEBODY OF ANOTHER WORKSPACE IS TOLD IT IS NOT FOUND AGAIN WHEN CHANGING ITS
# TASK (`found-6-oct/task-writes-answer-a-refusal-as-not-found`), and so is the
# platform's admin who is no member there (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`).
# Re-aimed 9 October: the time routes ask the same membership in the same words now (`assertMayTrackTime`), so the anchor takes the line after it.
# Reddens: refused-as-forbidden: "a change or a move of a task its caller may not open is refused 403 in the read’s words — a private task, list or space, a guest’s, a stranger’s — and nothing changes (SQL); a change of an id naming nothing is 404"
#          refused-as-forbidden: "the platform’s admin, no member of a workspace, makes no task there, imports nothing and changes none, each refused 403 “You are not a member of this workspace” with nothing written (SQL) — as before, it may read there"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (!membership) throw new ForbiddenException(READ_REFUSALS.notMember)\n\n  if (isManagerRole(membership.role)) return ctx\n',
     "  if (!membership) throw new NotFoundException('Workspace not found')\n\n  if (isManagerRole(membership.role)) return ctx\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("raf-14-a-strangers-write-answers-workspace-not-found: a stranger's change is told the workspace is not found")
