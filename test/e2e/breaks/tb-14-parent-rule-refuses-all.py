# A PARENT RULE THAT REFUSES EVERYTHING. Safe, and useless: no task can become a
# subtask at all. Only the positive twin tells this from the real rule.
# Reddens: task-boundaries: "while a parent in the same workspace is accepted and stored"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (!parent || parent.workspaceId !== workspaceId) throw new NotFoundException('Parent task not found')"
b = "    throw new NotFoundException('Parent task not found')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-14-parent-rule-refuses-all: applied")
