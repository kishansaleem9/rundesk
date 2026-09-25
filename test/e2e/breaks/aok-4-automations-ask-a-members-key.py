# MAKING AN AUTOMATION ASKS A KEY EVERY MEMBER HOLDS: a manager makes one.
# Reddens: admin-only-keys: "a manager makes no automation (403, none made) — a member granted automation.manage makes one, and the admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.controller.ts'
a = "  @Post()\n  // `automation.manage` (`role-editor-offers-unenforced-permissions`).\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('automation.manage')\n"
b = "  @Post()\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('report.view.basic')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aok-4-automations-ask-a-members-key: making an automation asks report.view.basic')
