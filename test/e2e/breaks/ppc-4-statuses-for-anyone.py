# THE PAGE IS TOLD ANYBODY MAY SHAPE THE PROJECT'S STATUSES: Statuses is offered to
# a guest passing through.
# Reddens: project-page-controls: "a guest passing through is offered none of them: no Statuses, Suggest tasks, Edit or Archive, no Rename or Delete on the list, and the members at most to read"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowed(assertMayShapeStatuses(this.db, { owner: 'project', ownerId: projectId, actorId })),\n"
b = "      Promise.resolve(row.workspaceId !== ''),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ppc-4-statuses-for-anyone: statuses for anyone')
