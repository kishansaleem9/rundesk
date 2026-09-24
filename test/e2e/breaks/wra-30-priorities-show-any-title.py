# PRIORITIES WITH NO VIEWER RULE, as they were: pin any task's id and its live title is shown to every colleague.
# Reddens: workspace-read-access: "a colleague’s priorities show a member the typed ones and the tasks they may open, and no title from a space they are refused — the admin’s own show it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = '          viewer ? or(isNull(userPriorities.taskId), viewer) : undefined,\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-30-priorities-show-any-title: applied")
