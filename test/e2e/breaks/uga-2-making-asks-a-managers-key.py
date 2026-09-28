# MAKING A GROUP ASKS A KEY MANAGERS HOLD, AS THE ADMIN GUARD ADMITTED THEM: members.invite, so a manager makes one and the member granted groups.manage makes none.
# Reddens: user-group-access: "a manager and a plain member make no user group (403 each, none written) — the member granted groups.manage makes one, as the admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('groups.manage')\n  create("
b = "  @RequirePermissions('members.invite')\n  create("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-2-making-asks-a-managers-key: POST /groups asks members.invite')
