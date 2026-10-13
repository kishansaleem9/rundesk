# Assigning an agent says nothing to it.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "given a task, the agent writes on it — a comment of its own, not a reply"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    agentTriggers.assigned({ taskId, userId: assigneeId, actorId })\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-10-an-assignment-starts-nothing: Assigning an agent says nothing to it.')
