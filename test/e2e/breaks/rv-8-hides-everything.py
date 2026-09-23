# A FILTER THAT HIDES EVERYTHING: safe, and the Teams page is empty.
# Reddens: read-visibility: "a member sees the teammate’s public work on their card"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '          containerVisibilityFilter(this.db, opts.actorId, isManager),\n'
b = '          sql`false`,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-8-hides-everything: applied")
