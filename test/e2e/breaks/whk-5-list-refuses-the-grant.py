# THE LIST BEHIND A PERMISSION THE GRANT DOES NOT GIVE: only admins can read webhooks.
# Reddens: webhook-access: "the member holding the grant lists the workspace’s webhooks"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.controller.ts'
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n  @ApiOperation({ summary: 'List all webhooks in a workspace' })\n"
b = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('workspace.manage')\n  @ApiOperation({ summary: 'List all webhooks in a workspace' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-5-list-refuses-the-grant: applied")
