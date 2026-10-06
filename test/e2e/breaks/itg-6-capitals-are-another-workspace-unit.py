# A WORKSPACE NAMED IN CAPITALS IS TAKEN FOR ANOTHER ONE (`found-5-oct/import-writes-into-another-workspace`).
# Reddens: unit: import-target.test.ts "a workspace named in capitals is the same workspace: its own space is not refused as another’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (space.workspaceId.toLowerCase() !== params.workspaceId.toLowerCase()) {\n'
b = '  if (space.workspaceId !== params.workspaceId) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('itg-6-capitals-are-another-workspace-unit: the workspace in the address is compared case by case')
