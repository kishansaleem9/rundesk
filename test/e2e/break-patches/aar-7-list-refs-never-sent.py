# List references are collected and then not asked for, so the chip for a container
# the AI just made is permanently unresolved while the request looks correct.
# Reddens: ai-answer-rendering: "the list reference became a chip too"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "        body: JSON.stringify({ workspaceId, taskIds: refIds.taskIds, listIds: refIds.listIds }),\n"
b = "        body: JSON.stringify({ workspaceId, taskIds: refIds.taskIds }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the reference batch never asks for lists.')
