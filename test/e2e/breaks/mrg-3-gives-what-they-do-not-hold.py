# A ROLE MAY GIVE WHAT ITS MAKER DOES NOT HOLD: a holder of roles.manage writes every key into a role.
# Reddens: member-role-grants: "a member granted roles.manage makes a role only of permissions they hold, assigns none holding more, and with members.role.change makes nobody an admin — while changing a member within their own rank"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.service.ts'
a = "    const beyond = [...new Set(permissions)].filter((p) => !grants.permissions.has(p))\n"
b = "    const beyond: string[] = []\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mrg-3-gives-what-they-do-not-hold: nobody is asked what they hold')
