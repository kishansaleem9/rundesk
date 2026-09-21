# The clash check stops being scoped to the project, so a name used anywhere in
# the workspace blocks it everywhere. "Backlog" exists once and no other project
# may have one — a refusal that is correct-looking, worded correctly, and about
# a list the person cannot see.
#
# Reddens: list-name-taken: "the same name is fine in a different project"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = '          eq(lists.projectId, projectId),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: a list name is reserved across every project at once.')
