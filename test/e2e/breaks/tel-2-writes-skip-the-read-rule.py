# A TASK IS CHANGED WITHOUT BEING READABLE: a private list's task by a member its space lets edit.
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Re-aimed 6 October: the read rule is asked with the account's role (`found-5-oct/super-admin-cannot-write-a-task-it-reads`).
# Re-aimed 8 October: the write rule asks `taskReadAnswer`, refusing in the read's words (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
# Reddens: task-edit-levels: "a task the member cannot open is not theirs to change, whatever the space lets them do — the admin changes it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if ('refused' in read) throw new ForbiddenException(read.refused)\n"
b = "  if ('refused' in read && actorId === '') throw new ForbiddenException(read.refused)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tel-2-writes-skip-the-read-rule: writes skip the read rule')
