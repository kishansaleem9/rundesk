# APPLY AS IT WAS: `for (const task of list.tasks)` — a template list with no tasks
# array answers 500 to whoever applies it. The suite's own folder template carries
# none, which is how this was found.
# Reddens: space-default-permission: "while applying it into a space they may edit makes it there"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "      for (const task of list.tasks ?? []) {\n"
b = "      for (const task of list.tasks) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-29-template-tasks-iterated-bare: applied")
