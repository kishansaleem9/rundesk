# THE SPREADSHEET PREVIEW ASKS NO KEY (`found-6-oct/import-previews-tell-what-private-places-hold`): any member or guest previews,
# and its duplicate count tells them what a private space holds.
# Reddens: imports: "a member and a guest without workspace.import are refused both previews, 403 “Missing required permission: workspace.import”, as the imports refuse them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('workspace.import')\n  @ApiOperation({ summary: 'Parse without writing"
b = "  @ApiOperation({ summary: 'Parse without writing"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-44-sheet-preview-asks-no-key: the spreadsheet preview asks no permission')
