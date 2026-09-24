# AN EDIT READS THE GOAL BY ID ALONE: anyone who may reach the route renames a goal they may not read.
# Reddens: goal-access: "the member can neither rename nor delete the private goal (404 each), which is unchanged — the open goal is renamed (200)"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = '    const goal = await this.goalOpenTo(goalId, actor)\n    const [existing] = await this.db.select().from(goals).where(eq(goals.id, goal.id))\n'
b = "    const [existing] = await this.db.select().from(goals).where(eq(goals.id, goalId))\n    const goal = { id: goalId, workspaceId: existing?.workspaceId ?? '', spaceId: existing?.spaceId ?? null, spaceVisibility: null }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-5-edit-skips-the-reader: applied")
