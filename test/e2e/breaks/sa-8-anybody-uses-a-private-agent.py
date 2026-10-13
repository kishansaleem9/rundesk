# Whoever can name a private agent may start it.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "a private agent mentioned by somebody it is not shared with does not answer; its run is skipped, with why"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (!agent.isPrivate || agent.createdById === userId) return true\n'
b = '    if (agent) return true\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-8-anybody-uses-a-private-agent: Whoever can name a private agent may start it.')
