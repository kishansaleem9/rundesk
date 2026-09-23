# A TASK FILTER THAT FORGETS ASSIGNEES: a person's own private task disappears from
# their own card.
# Reddens: read-visibility: "and the teammate sees all five of their own"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '          taskVisibilityFilter(this.db, opts.actorId, isManager),\n'
b = "          isManager ? undefined : ne(tasks.visibility, 'private'),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-10-own-private-work-hidden: applied")
