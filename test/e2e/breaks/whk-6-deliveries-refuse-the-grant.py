# THE DELIVERY LOG BEHIND A PERMISSION THE GRANT DOES NOT GIVE.
# Reddens: webhook-access: "and reads the delivery log"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.controller.ts'
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n  @ApiOperation({ summary: 'List recent deliveries for a webhook' })\n"
b = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('workspace.manage')\n  @ApiOperation({ summary: 'List recent deliveries for a webhook' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-6-deliveries-refuse-the-grant: applied")
