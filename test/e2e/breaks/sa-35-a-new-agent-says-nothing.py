# A NEW AGENT SAYS NOTHING: made, it does not tell its maker what it can do or what starts it.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "made, the agent DMs its maker what it can do and what starts it"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '    void this.runner.introduce(made.id).catch(() => {})\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('sa-35-a-new-agent-says-nothing: a new agent does not introduce itself')
