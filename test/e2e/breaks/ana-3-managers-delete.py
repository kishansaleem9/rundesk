# DELETING AN ANNOUNCEMENT ASKS A KEY MANAGERS HOLD TOO: a manager deletes another’s banner.
# Reddens: announcement-access: "a manager and a plain member delete no announcement (403 each, the row stays) — the member granted announcement.manage deletes one, and it is gone"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('announcement.manage')\n  remove("
b = "  @RequirePermissions({ any: true, all: ['announcement.manage', 'members.profile.manage'] })\n  remove("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-3-managers-delete: DELETE /announcements/:id admits members.profile.manage (managers)')
