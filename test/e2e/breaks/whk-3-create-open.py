# MAKING A WEBHOOK NEEDS NOTHING: any member can point workspace events anywhere.
# Reddens: webhook-access: "and may not make one — nothing is created"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.controller.ts'
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n  @ApiOperation({ summary: 'Create a new webhook (needs webhook.manage)' })\n"
b = "  @ApiOperation({ summary: 'Create a new webhook (needs webhook.manage)' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-3-create-open: applied")
