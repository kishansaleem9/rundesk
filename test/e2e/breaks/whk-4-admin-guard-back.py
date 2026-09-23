# THE ADMIN-OR-MANAGER GUARD BACK IN FRONT OF THE PERMISSION: a custom role granting
# webhook.manage to anybody else is saved, shown and useless.
# Reddens: webhook-access: "and makes one — the admin-only guard in front of the permission is gone"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.controller.ts'
a = "import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'\n"
b = "import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'\nimport { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.controller.ts'
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n  @ApiOperation({ summary: 'Create a new webhook (needs webhook.manage)' })\n"
b = "  @UseGuards(WorkspaceAdminGuard, PermissionsGuard)\n  @RequirePermissions('webhook.manage')\n  @ApiOperation({ summary: 'Create a new webhook (needs webhook.manage)' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-4-admin-guard-back: applied")
