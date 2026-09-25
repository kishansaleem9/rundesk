# INVITING ASKS A KEY THE INVITER DOES NOT HOLD, AS THE MANAGER ROLE LIST DID: a member granted members.invite invites no one.
# Reddens: settings-tabs-by-key: "a member granted members.invite invites a member, and no one above themself (403 for a manager) — a plain member invites no one, and a manager invites no admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return user.role === 'super_admin' || this.roles.hasPermission(workspaceId, user.id, 'members.invite')\n"
b = "    return user.role === 'super_admin' || this.roles.hasPermission(workspaceId, user.id, 'members.role.change')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-1-inviting-asks-another-key: inviting asks members.role.change')
