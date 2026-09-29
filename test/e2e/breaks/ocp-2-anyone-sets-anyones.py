# ANY MEMBER SETS A COLLEAGUE'S CAPACITY: the key is not asked.
# Reddens: own-capacity: "a plain member setting a colleague’s capacity is refused (403), told it takes the Set member profiles permission, and nothing changes"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "      !(await this.customRoles.hasPermission(workspaceId, user.id, 'members.profile.manage'))\n"
b = "      Boolean(0) && !(await this.customRoles.hasPermission(workspaceId, user.id, 'members.profile.manage'))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ocp-2-anyone-sets-anyones: the key is not asked')
