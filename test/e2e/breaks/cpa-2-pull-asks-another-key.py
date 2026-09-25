# THE PULL ASKS ANOTHER KEY: a member who manages integrations is refused the workspace's own calendar.
# Reddens: calendar-pull-access: "a member granted integrations.manage, and the admin, are let through to the calendar — here, where it cannot be reached, to the provider’s failure rather than a refusal"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.controller.ts'
a = "  @Post(':provider/pull')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('integrations.manage')\n"
b = "  @Post(':provider/pull')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpa-2-pull-asks-another-key: the pull asks webhook.manage')
