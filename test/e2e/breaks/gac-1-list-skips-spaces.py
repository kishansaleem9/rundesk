# THE GOAL LIST TAKES NO READER: every goal of the workspace, a private space's included, as it did.
# Reddens: goal-access: "a member’s goal list holds the open space’s goal and the workspace’s, not the private space’s — the admin’s holds all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = "      reach === 'spaces' ? goalVisibilityFilter(this.db, actor.id) : undefined,\n"
b = '      undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-1-list-skips-spaces: applied")
