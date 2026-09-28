# PUBLISHING ASKS A KEY MANAGERS HOLD TOO: a manager publishes a banner across the workspace.
# Reddens: announcement-access: "publishing a workspace announcement is refused to a manager and to a plain member (403 each, nothing saved) — the member granted announcement.manage publishes one, and so does a workspace admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('announcement.manage')\n  create("
b = "  @RequirePermissions({ any: true, all: ['announcement.manage', 'members.profile.manage'] })\n  create("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-1-managers-publish: POST /announcements admits members.profile.manage (managers)')
