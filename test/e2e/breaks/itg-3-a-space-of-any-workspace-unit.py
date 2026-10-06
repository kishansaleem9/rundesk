# A SPACE OF ANOTHER WORKSPACE IS PUT TO THE CREATE GATE (`found-5-oct/import-writes-into-another-workspace`).
# Reddens: unit: import-target.test.ts "a space of another workspace is 403 with its reason, and the create gate is not asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (space.workspaceId.toLowerCase() !== params.workspaceId.toLowerCase()) {\n    throw new ForbiddenException('That space is not in this workspace')\n  }\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("itg-3-a-space-of-any-workspace-unit: a space of another workspace passes on")
