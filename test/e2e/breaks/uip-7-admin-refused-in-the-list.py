# SETTINGS → ARCHIVED REFUSES THE ADMIN RESTORE: the batched answer for an admin is wrong.
# Reddens: unarchive-in-place: "Settings → Archived offers Restore as the rule does: the admin every row, a manager the rows of their own spaces, a member where they may edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (role === 'workspace_admin' || role === 'super_admin') return rows.map(() => true)\n"
b = "    if (role === 'workspace_admin' || role === 'super_admin') return rows.map(() => false)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("uip-7-admin-refused-in-the-list: the admin's rows read unrestorable")
