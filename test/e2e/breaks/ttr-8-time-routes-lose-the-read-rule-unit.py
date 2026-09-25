# THE TIME ROUTES LOSE THE READ RULE, as the unit test states it: the controller is guarded by the sign-in alone.
# Reddens: unit: time-entries.guard.test.ts "guards the whole controller with the sign-in and the read rule"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/time-entries.controller.ts'
a = "@UseGuards(JwtAuthGuard, ResourceMemberGuard)\nexport class TaskTimeEntriesController {\n"
b = "@UseGuards(JwtAuthGuard)\nexport class TaskTimeEntriesController {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ttr-8-time-routes-lose-the-read-rule-unit: the controller asks the sign-in alone")
