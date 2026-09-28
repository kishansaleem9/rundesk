# THE PROJECT PAGE ASKS EACH LIST'S DELETE AS A PROJECT'S: project.delete answers it, list.delete does not.
# Reddens: container-delete-keys: "the project page is told what the routes answer: Delete on another member’s list for the member granted list.delete, Archive of the project for the one granted project.delete, and neither for a plain member"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "        allowed(manage(list.createdById, 'list', 'delete', list.id)),\n"
b = "        allowed(manage(list.createdById, 'project', 'delete', list.id)),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cdk-6-list-capability-asks-the-project-key: each list's Delete asks project.delete")
