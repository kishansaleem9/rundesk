# CREATETASK'S LABELS AS THEY WERE: written without asking whose they are.
# Reddens: task-boundaries: "and a task cannot be born wearing another workspace’s label"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      if (own.length !== bornLabels.length) throw new NotFoundException('Label not found')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-33-born-label-any-workspace: applied")
