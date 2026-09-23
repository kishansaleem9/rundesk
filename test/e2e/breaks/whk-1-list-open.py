# THE LIST AS IT WAS: any workspace member reads every webhook, secret and all.
# Reddens: webhook-access: "a plain member is refused the list — no URL, no secret"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.controller.ts'
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n  @ApiOperation({ summary: 'List all webhooks in a workspace' })\n"
b = "  @ApiOperation({ summary: 'List all webhooks in a workspace' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-1-list-open: applied")
