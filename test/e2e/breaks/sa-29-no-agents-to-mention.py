# The comment @ picker’s Agents section lists no agent.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "the comment @ picker has an Agents section listing the agents the reader may use"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    .filter((a) => a.isActive && a.name.toLowerCase().includes(mentionQuery))\n    .map((a) => ({ userId: a.userId, displayName: a.name, email: '' }) as WorkspaceMemberLite)"
b = "    .filter(() => false)\n    .map((a) => ({ userId: a.userId, displayName: a.name, email: '' }) as WorkspaceMemberLite)"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-29-no-agents-to-mention: The comment @ picker’s Agents section lists no agent.')
