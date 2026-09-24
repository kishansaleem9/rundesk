# ANY USER ID MAY OWN A GOAL, as it could: a member who cannot read it, or a stranger.
# Reddens: goal-access: "an owner must be able to read the goal: the member refused the private space cannot own its goal, nor a stranger any (400 each) — the admin owns the private goal, the member the open one (200 each)"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = '    if (!isUuid(ownerId) || !(await mayReadGoalAt(this.db, at, { id: ownerId }))) {\n'
b = '    if (!isUuid(ownerId)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-13-any-owner: applied")
