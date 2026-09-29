# THE RANK RULE IS NOT ASKED: a manager sets an admin's capacity.
# Reddens: own-capacity: "a manager sets a plain member’s capacity (200) and is refused an admin’s (403), somebody above their own role"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertWithinRank(workspaceId, actor, [previous.role], 'set the capacity of somebody who is')\n"
b = "    void [workspaceId, actor, previous.role, 'set the capacity of somebody who is']\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ocp-4-rank-ignored: the rank rule is gone')
