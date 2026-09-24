# THE PATCH SPREADS WHAT IT IS SENT INTO THE ROW, as it did: `spaceId`, `parentGoalId`, `workspaceId`.
# Reddens: goal-access: "a PATCH that names spaceId and parentGoalId changes neither, while its title is changed"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = "    const set: Record<string, unknown> = { updatedAt: new Date() }\n    if (patch.title !== undefined) {\n      if (typeof patch.title !== 'string' || !patch.title.trim()) throw new BadRequestException('A goal needs a title')\n"
b = "    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }\n    if (patch.title !== undefined) {\n      if (typeof patch.title !== 'string' || !patch.title.trim()) throw new BadRequestException('A goal needs a title')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-6-patch-spreads-the-body: applied")
