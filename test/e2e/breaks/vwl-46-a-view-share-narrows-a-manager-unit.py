# A SHARE ON A VIEW NARROWS A MANAGER, whom no grant narrows anywhere else.
# Reddens: unit: view-write.test.ts "a manager is not narrowed by a share on a view, and nobody resolved stays nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  if (onList.source === 'workspace-role') return onList.level\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-46-a-view-share-narrows-a-manager-unit: a share on a view narrows a manager")
