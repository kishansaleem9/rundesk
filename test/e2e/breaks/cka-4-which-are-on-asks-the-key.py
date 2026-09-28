# WHICH CLICKAPPS ARE ON IS LOCKED WITH THE OVERRIDE LIST: every page's navigation meets a refusal.
# Reddens: clickapp-flags-access: "a plain member’s pages learn which ClickApps are on from /feature-flags/resolved (200, Goals off) and never ask for the override list or meet a refusal"
#   or "a plain member and the manager still read which ClickApps are on (200): Goals, switched off by the admin, reads off for them, and Docs stays on"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Get('resolved')\n  async getResolved("
b = "  @Get('resolved')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('workspace.clickapps.manage')\n  async getResolved("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-4-which-are-on-asks-the-key: GET feature-flags/resolved asks workspace.clickapps.manage')
