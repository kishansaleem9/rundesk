# An Automation’s Run a Super Agent action does nothing.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "the rule runs the agent on the task with the action’s own instructions, and it answers on the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        if (!agentId || !ctx.taskId) break\n'
b = '        if (agentId || !agentId) break\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-17-the-automation-action-does-nothing: An Automation’s Run a Super Agent action does nothing.')
