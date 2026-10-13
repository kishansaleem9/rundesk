# BASECAMP'S IMPORT ASKS NO PERMISSION (security): neither the route nor the service
# asks for Import data, so any member is offered it.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "a way back whose state this server did not sign is refused though its code is good, and keeps nothing; a member without the Import data permission is not offered Basecamp at all"
#
# Both layers go: either one alone still refuses Mia, which is what two of them are for.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/basecamp-import/basecamp-import.module.ts'
a = "@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)\n@RequirePermissions('workspace.import')\n@Controller('workspaces/:workspaceId/import/basecamp')\n"
b = "@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)\n@Controller('workspaces/:workspaceId/import/basecamp')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/integrations/basecamp-import/basecamp-import.service.ts'
a = "  async status(workspaceId: string, importer: Importer) {\n    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })\n"
b = "  async status(workspaceId: string, importer: Importer) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imp-13-basecamp-asks-no-permission: any member is offered Basecamp')
