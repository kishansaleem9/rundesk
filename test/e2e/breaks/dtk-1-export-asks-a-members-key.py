# EXPORTING THE WORKSPACE ASKS A KEY EVERY MEMBER HOLDS: a manager exports everything.
# Reddens: data-transfer-keys: "a manager exports neither the workspace’s data nor its people (403 each) — a member granted workspace.export exports all three, and the admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/export/export.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "@RequirePermissions('workspace.export')\n@Controller('workspaces/:workspaceId/export')"
b = "@RequirePermissions('report.view.basic')\n@Controller('workspaces/:workspaceId/export')"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-1-export-asks-a-members-key: export asks report.view.basic')
