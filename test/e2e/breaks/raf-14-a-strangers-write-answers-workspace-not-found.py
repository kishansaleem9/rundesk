# SOMEBODY OF ANOTHER WORKSPACE IS TOLD IT IS NOT FOUND AGAIN WHEN CHANGING ITS
# TASK (`found-6-oct/task-writes-answer-a-refusal-as-not-found`), and so is the
# platform's admin who is no member there (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`).
# Reddens: refused-as-forbidden: "a change or a move of a task its caller may not open is refused 403 in the read’s words — a private task, list or space, a guest’s, a stranger’s — and nothing changes (SQL); a change of an id naming nothing is 404"
#          refused-as-forbidden: "the platform’s admin, no member of a workspace, makes no task there, imports nothing and changes none, each refused 403 “You are not a member of this workspace” with nothing written (SQL) — as before, it may read there"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = "  if (!membership) throw new ForbiddenException(READ_REFUSALS.notMember)\n"
b = "  if (!membership) throw new NotFoundException('Workspace not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-14-a-strangers-write-answers-workspace-not-found: a stranger\'s change is 404 again')
