# DELETING A GROUP ASKS A KEY MANAGERS HOLD: members.invite, so a manager deletes it and the member granted groups.manage deletes none.
# Reddens: user-group-access: "a manager and a plain member delete no user group (403 each, it stays) — the member granted groups.manage deletes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('groups.manage')\n  remove("
b = "  @RequirePermissions('members.invite')\n  remove("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-7-deleting-asks-a-managers-key: DELETE /groups/:id asks members.invite')
