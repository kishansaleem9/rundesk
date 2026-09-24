# A GUEST IS GIVEN EVERY SPRINT: the reach's "none" read as "all".
# Reddens: sprint-access: "a member’s sprints are the open space’s and the workspace’s, not the private space’s; a guest is given none; the admin all"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "    if (reach === 'none') return []\n    return this.db\n      .select()\n      .from(sprints)\n"
b = '    return this.db\n      .select()\n      .from(sprints)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-2-a-guest-reads-every-sprint: applied")
