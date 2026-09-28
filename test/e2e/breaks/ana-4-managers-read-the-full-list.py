# THE FULL LIST ASKS A KEY MANAGERS HOLD TOO: a manager reads paused announcements and their counts.
# Reddens: announcement-access: "the full list of announcements, paused ones and their view counts included, is refused to a manager and a plain member (403) — the member granted announcement.manage reads it, the paused one with it"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('announcement.manage')\n  list("
b = "  @RequirePermissions({ any: true, all: ['announcement.manage', 'members.profile.manage'] })\n  list("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-4-managers-read-the-full-list: GET /announcements admits members.profile.manage (managers)')
