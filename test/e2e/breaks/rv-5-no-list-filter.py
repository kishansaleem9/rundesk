# PRIVATE LISTS LEFT OUT.
# Reddens: read-visibility: "nor one in somebody else’s private list"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '          listVisibilityFilter(opts.actorId, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-5-no-list-filter: applied")
