# A direct message to an agent is never answered.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "a direct message is answered in the DM, by the agent"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (!e.isDm || mentioned.length) return\n'
b = '    if (e.isDm || !e.isDm) return\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-15-direct-messages-unanswered: A direct message to an agent is never answered.')
