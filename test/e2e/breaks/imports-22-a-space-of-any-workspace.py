# A SPACE OF ANOTHER WORKSPACE IS PUT TO THE CREATE GATE AS IF IT WERE THIS ONE'S (`found-5-oct/import-writes-into-another-workspace`):
# the gate answers nothing for an importer who is no member there, so both imports write into it.
# (Reddens the ClickUp check beside it as well.)
# Reddens: imports: "the spreadsheet import refuses a space of another workspace, 403 “That space is not in this workspace”, and one naming nothing 404 — writing nothing there, not even a job row"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (space.workspaceId.toLowerCase() !== params.workspaceId.toLowerCase()) {\n    throw new ForbiddenException('That space is not in this workspace')\n  }\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-22-a-space-of-any-workspace: an import takes a space of another workspace")
