# THE PAGE IS TOLD ANYBODY MAY CHANGE THE PROJECT'S MEMBERS: the sheet offers
# add, re-role and remove to a member the routes refuse.
# Reddens: project-page-controls: "a member who did not make the project is offered Statuses and Suggest tasks, and Rename and Delete on the list they made — not Edit or Archive, not the admin’s list, and the members only to read"
#   or "a guest passing through is offered none of them: no Statuses, Suggest tasks, Edit or Archive, no Rename or Delete on the list, and the members at most to read"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      allowed(this.assertCanManageProject(projectId, actorId)),\n'
b = "      Promise.resolve(row.workspaceId !== ''),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ppc-3-members-for-anyone: members for anyone')
