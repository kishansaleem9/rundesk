# THE LIVE BANNER ASKS announcement.manage: a plain member and a manager read no banner at all.
# Reddens: announcement-access: "every member reads the live banner — the plain member, the manager and the granted member get it (200), never the paused one — and a dismissal hides it for the one who dismissed it alone"
#   or "the plain member’s workspace home shows the newest live banner with its Dismiss, and never the paused one"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Get('active')\n  @UseGuards(WorkspaceMemberGuard)\n"
b = "  @Get('active')\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('announcement.manage')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-5-live-banner-asks-the-key: GET /announcements/active asks announcement.manage')
