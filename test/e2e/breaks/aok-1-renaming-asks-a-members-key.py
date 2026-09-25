# RENAMING THE WORKSPACE ASKS A KEY EVERY MEMBER HOLDS: a manager renames it, as WorkspaceAdminGuard let them.
# Reddens: admin-only-keys: "a manager neither renames nor archives the workspace (403 each, unchanged) — a member granted workspace.manage renames it, and the admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = "  @Patch(':workspaceId')\n  // `workspace.manage` — rename, logo, domain, archive, restore — as the catalog\n  // says; `WorkspaceAdminGuard` admitted managers (`role-editor-offers-unenforced-permissions`).\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('workspace.manage')\n"
b = "  @Patch(':workspaceId')\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('report.view.basic')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aok-1-renaming-asks-a-members-key: renaming asks report.view.basic')
