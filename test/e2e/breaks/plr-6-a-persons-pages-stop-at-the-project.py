# A PERSON'S PAGES ASK THE SPACE AND THE PROJECT ONLY: their profile and calendar name a private list's task.
# Reddens: private-list-reach: "the admin’s profile, calendar and shared tasks, read by the member, name none of the private list’s — the profile has the open one, and the admin’s own has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      where: and(taskInReachFilter(this.db, workspaceId, requesterId, isManager), taskVisibilityFilter(this.db, requesterId, isManager)),\n'
b = '      where: and(containerVisibilityFilter(this.db, requesterId, isManager), taskVisibilityFilter(this.db, requesterId, isManager)),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-6-a-persons-pages-stop-at-the-project: applied")
