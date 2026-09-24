# A SPACE'S PROJECT LIST ASKS NO CONTAINER RULE, as its own copy never learnt the folder: a private folder's project is listed.
# Reddens: private-folder-reach: "the member is listed neither the private folder nor its project — the open folder’s project is, and the admin’s list has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
a = '      .where(and(base, containerVisibilityFilter(this.db, actorId, isManager)))\n'
b = '      .where(and(base, isManager ? undefined : undefined))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pfr-3-the-project-list-asks-nothing: applied")
