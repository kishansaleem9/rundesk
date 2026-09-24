# A GOAL BY ID IS ANY MEMBER'S: the space it is filed in is not asked.
# Re-anchored when `readableSprint` took the same return line (a sprint is read
# as a goal is); the edit is the same, to the goal's own function.
# Reddens: goal-access: "the private space’s goal, its history and its key results are not found for the member (404 each) — the open goal opens (200)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/read-access.ts'
a = '    .where(eq(goals.id, goalId))\n    .limit(1)\n  if (!row) return null\n  return (await mayReadGoalAt(db, row, actor)) ? row : null\n'
b = "    .where(eq(goals.id, goalId))\n    .limit(1)\n  if (!row) return null\n  return (await goalReach(db, row.workspaceId, actor)) === 'none' ? null : row\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-2-by-id-skips-spaces: applied")
