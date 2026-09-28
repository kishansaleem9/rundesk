# A MANAGER'S TRASH IS THE WORKSPACE'S AGAIN: every deletion listed, restored, purged and emptied.
# Reddens: trash-rules: "a manager’s Trash is a member’s: their own deletions only, and no one else’s restored, purged or emptied (403 each)"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return { isAdmin: isAdminRole(member.role) }\n"
b = "    return { isAdmin: isAdminRole(member.role) || member.role === 'manager' }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-1-managers-trash-is-the-workspaces: managers act as admins')
