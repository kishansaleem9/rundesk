# A GOAL MAY BE MADE UNDER ANY GOAL AT ALL: the parent is neither read nor required to be of this workspace.
# Reddens: goal-access: "they can file no goal in this workspace’s space or under its goal (404 each), and patching their goal’s workspaceId leaves it in their own — a plain goal of their own is made (201)"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = "    if (data.parentGoalId) {\n      const parent = await readableGoal(this.db, data.parentGoalId, actor)\n      if (!parent || parent.workspaceId !== data.workspaceId) throw new NotFoundException('Parent goal not found')\n      if (data.spaceId === undefined) spaceId = parent.spaceId\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-12-parent-from-anywhere: applied")
