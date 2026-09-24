# A GOAL BY ID IS ANY MEMBER'S: the space it is filed in is not asked.
# Reddens: goal-access: "the private space’s goal, its history and its key results are not found for the member (404 each) — the open goal opens (200)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/read-access.ts'
a = '  return (await mayReadGoalAt(db, row, actor)) ? row : null\n'
b = "  return (await goalReach(db, row.workspaceId, actor)) === 'none' ? null : row\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-2-by-id-skips-spaces: applied")
