# A MANAGER IS OFFERED RESTORE IN EVERY SPACE: the batch forgets the manager's own spaces.
# Reddens: unarchive-in-place: "Settings → Archived offers Restore as the rule does: the admin every row, a manager the rows of their own spaces, a member where they may edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      return rows.map((r) => inMine.has(r.spaceId))\n'
b = '      return rows.map(() => true)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uip-8-manager-everywhere: a manager restores everywhere')
