# THE PULL ASKS MEMBERSHIP ALONE, as it did: any member or guest sets the workspace's calendar connection to work.
# Reddens: calendar-pull-access: "a member who may not manage the workspace’s integrations, and a guest, pull nothing from its calendar — refused (403) before the connection is used, nothing made in its inbox"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.controller.ts'
a = "  @Post(':provider/pull')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('integrations.manage')\n"
b = "  @Post(':provider/pull')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpa-1-pull-asks-membership: the pull asks membership alone')
