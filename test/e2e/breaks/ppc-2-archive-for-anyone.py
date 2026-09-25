# THE PAGE IS TOLD ANYBODY MAY ARCHIVE THE PROJECT.
# Reddens: project-page-controls: "a member who did not make the project is offered Statuses and Suggest tasks, and Rename and Delete on the list they made — not Edit or Archive, not the admin’s list, and the members only to read"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowed(manage(row.createdById, 'project', 'delete')),\n"
b = "      Promise.resolve(row.workspaceId !== ''),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ppc-2-archive-for-anyone: archive for anyone')
