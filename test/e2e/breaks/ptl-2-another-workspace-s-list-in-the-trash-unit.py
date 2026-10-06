# A DEFAULT LIST OF ANOTHER WORKSPACE IS SAID TO BE IN THIS ONE’S TRASH.
# Reddens: unit: planner-default-list-trash.test.ts "does not for a list of another workspace, which /task passes over there"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '    if (home?.workspaceId !== workspaceId) return false\n'
b = '    if (home?.workspaceId !== workspaceId) return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptl-2-another-workspace-s-list-in-the-trash-unit: another workspace’s list is said to be in the trash')
