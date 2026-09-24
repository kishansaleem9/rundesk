# THE RELATED TASKS LEFT OUT ARE NOT COUNTED: a dependency the reader cannot see is not known to be there.
# Reddens: related-task-access: "and says how many it left out: two for the member, none for the admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      hiddenDependencies: dependencyRows.length - visibleDependencies.length,\n'
b = '      hiddenDependencies: 0,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rta-2-hidden-uncounted: applied")
