# THE CHOSEN LIST IS READ BY NOTHING AGAIN: every task without a list takes the
# oldest one.
# Reddens: planner-default-list: "/task puts its task in the list chosen as the default for new tasks"
#   or "a chat message made into a task lands in that list too"
#   or "and so does an AI answer made into a task"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (chosen) {\n'
b = "    if (chosen === '__never__') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-1-chosen-list-ignored: the chosen list is ignored')
