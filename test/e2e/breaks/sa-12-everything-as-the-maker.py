# An agent always acts with its maker’s rights, whoever started it.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "nor can it do for her what she may not: a list she cannot read gets no task, and the answer says it was skipped"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const actorId = job.triggeredById ?? agent.createdById\n'
b = '    const actorId = agent.createdById\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-12-everything-as-the-maker: An agent always acts with its maker’s rights, whoever started it.')
