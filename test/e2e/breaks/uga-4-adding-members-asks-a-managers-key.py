# ADDING A GROUP’S MEMBERS ASKS A KEY MANAGERS HOLD: members.invite, so a manager adds one and the member granted groups.manage adds none.
# Reddens: user-group-access: "a manager and a plain member neither add, replace nor remove a group’s members (403 on all three routes, the set unchanged) — the member granted groups.manage does all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('groups.manage')\n  addMembers("
b = "  @RequirePermissions('members.invite')\n  addMembers("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-4-adding-members-asks-a-managers-key: POST /groups/:id/members asks members.invite')
