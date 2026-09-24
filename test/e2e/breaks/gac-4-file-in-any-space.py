# A GOAL MAY BE FILED IN A SPACE ITS MAKER IS REFUSED.
# Reddens: goal-access: "the member can file no goal in the private space or under its goal (404 each, and no row made) — one filed in the open space is made (201)"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = "    if (spaceId && !(await mayReadGoalAt(this.db, at, actor))) throw new NotFoundException('Space not found')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-4-file-in-any-space: applied")
