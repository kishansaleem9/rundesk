# EACH LIST'S RENAME IS ANSWERED BY WHO MADE THE PROJECT, not the list: a member who
# made a list is not offered its Rename.
# Reddens: project-page-controls: "a member who did not make the project is offered Statuses and Suggest tasks, and Rename and Delete on the list they made — not Edit or Archive, not the admin’s list, and the members only to read"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "        allowed(manage(list.createdById, 'list', 'manage')),\n"
b = "        allowed(manage(row.createdById, 'list', 'manage')),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ppc-6-lists-by-the-projects-maker: lists answered by the maker of the project")
