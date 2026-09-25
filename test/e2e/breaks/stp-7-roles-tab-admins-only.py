# THE ROLES TAB IS AN ADMIN’S AGAIN: a member granted roles.manage is sent away.
# Reddens: settings-tabs-by-key: "a member granted roles.manage opens Settings on Roles, offered New role"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  roles: ['roles.manage'],\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-7-roles-tab-admins-only: Roles opens to admins alone')
