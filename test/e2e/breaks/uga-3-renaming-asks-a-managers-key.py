# RENAMING A GROUP ASKS A KEY MANAGERS HOLD: members.invite, so a manager renames it and the member granted groups.manage does not.
# Reddens: user-group-access: "a manager and a plain member rename no user group (403 each, its name unchanged) — the member granted groups.manage renames it and sets its description"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('groups.manage')\n  update("
b = "  @RequirePermissions('members.invite')\n  update("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-3-renaming-asks-a-managers-key: PATCH /groups/:id asks members.invite')
