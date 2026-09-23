# THE DELIVERY LOG AS IT WAS: any member reads every payload sent.
# Reddens: webhook-access: "nor the delivery log, whose payloads are the workspace’s data"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.controller.ts'
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n  @ApiOperation({ summary: 'List recent deliveries for a webhook' })\n"
b = "  @ApiOperation({ summary: 'List recent deliveries for a webhook' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-2-deliveries-open: applied")
