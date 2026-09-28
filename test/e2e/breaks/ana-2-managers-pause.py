# EDITING AN ANNOUNCEMENT ASKS A KEY MANAGERS HOLD TOO: a manager pauses and renames another’s banner.
# Reddens: announcement-access: "a manager and a plain member can neither pause nor rename another’s announcement (403 each, it stays live and named) — the member granted announcement.manage pauses one"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('announcement.manage')\n  update("
b = "  @RequirePermissions({ any: true, all: ['announcement.manage', 'members.profile.manage'] })\n  update("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-2-managers-pause: PATCH /announcements/:id admits members.profile.manage (managers)')
