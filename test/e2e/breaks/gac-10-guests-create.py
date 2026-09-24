# A GUEST MAY CREATE A GOAL, as they could.
# Reddens: goal-access: "a guest can neither create a goal (403) nor delete one (404), which stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = "    if ((await goalReach(this.db, data.workspaceId, actor)) === 'none') {\n      throw new ForbiddenException('Guests cannot create goals')\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-10-guests-create: applied")
