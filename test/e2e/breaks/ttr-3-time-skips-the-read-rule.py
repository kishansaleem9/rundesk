# A TASK'S TIME ASKS NO READ RULE: anybody in the workspace puts time on any task whose id they have.
# Reddens: time-tracking-readers: "a guest starts, stops and logs time on a task shared with them at View — not on one that is not (403, none made) — and a member of a view-only space does as the guest does"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/time-entries.controller.ts'
a = "@UseGuards(JwtAuthGuard, ResourceMemberGuard)\nexport class TaskTimeEntriesController {\n"
b = "@UseGuards(JwtAuthGuard)\nexport class TaskTimeEntriesController {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ttr-3-time-skips-the-read-rule: the time routes ask no read rule")
