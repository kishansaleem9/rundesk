# A MANAGER RETITLES AN ADMIN AGAIN: the rank is not asked.
# Reddens: job-title-rule: "a manager sets a member’s and a fellow manager’s job title, and is refused an admin’s (403), which stays — nobody sets the profile of somebody above their own role"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (roleRank(target.role) > roleRank(actor?.role)) {\n'
b = '      if (roleRank(target.role) > roleRank(actor?.role) && Boolean(0)) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-3-no-rank: done')
