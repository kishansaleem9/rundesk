# A WORKSPACE NAMED IN CAPITALS IS TAKEN FOR ANOTHER ONE (`found-5-oct/import-writes-into-another-workspace`): the space is compared with the address as a
# string, so an import into the workspace's own space answers 403 "That space is not in this workspace", which is untrue.
# Reddens: imports: "an import addressed to its workspace in capitals takes that workspace’s own space — both importers — rather than refusing it as another workspace’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (space.workspaceId.toLowerCase() !== params.workspaceId.toLowerCase()) {\n'
b = '  if (space.workspaceId !== params.workspaceId) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-34-capitals-are-another-workspace: the workspace in the address is compared case by case')
