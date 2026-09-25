# A GUEST CHANGES ANY TASK THEY MAY READ, WHATEVER IT WAS SHARED AT.
# Reddens: guest-task-edits: "a task shared with a guest to view or to comment is not theirs to change — its title and status stay (403) — and the refusal says what was shared with them"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = '  const [assignee] = await db\n'
b = "  if (membership.role === 'guest') return ctx\n  const [assignee] = await db\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('gte-4-guests-at-any-share: a guest changes any task they may read, whatever it was shared at')
