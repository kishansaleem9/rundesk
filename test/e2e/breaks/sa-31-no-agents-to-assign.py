# The assignee picker lists no agent that is switched on.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "the assignee picker lists agents in their own section, marked as agents, not among the people"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          (a) => a.isActive && !assignedIds.has(a.userId) && (!needle || a.name.toLowerCase().includes(needle)),'
b = '          (a) => !a.isActive && !assignedIds.has(a.userId) && (!needle || a.name.toLowerCase().includes(needle)),'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-31-no-agents-to-assign: The assignee picker lists no agent that is switched on.')
