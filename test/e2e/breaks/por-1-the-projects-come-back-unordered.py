# A SPACE'S PROJECTS COME BACK IN WHATEVER ORDER THE DATABASE ANSWERS AGAIN.
# Reddens: project-order: "a space’s projects come back in their dragged order, a shared place kept by age"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
a = '      .where(and(base, containerVisibilityFilter(this.db, actorId, isManager)))\n      .orderBy(...order)\n'
b = '      .where(and(base, containerVisibilityFilter(this.db, actorId, isManager)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("por-1-the-projects-come-back-unordered: applied")
