# Anybody who sees an agent may change it.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "only its maker or a workspace admin changes an agent"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (agent.createdById !== actor.id && !isManager) {\n      throw new ForbiddenException('Only its maker or a workspace admin may change this Super Agent')\n    }\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-4-anybody-changes-an-agent: Anybody who sees an agent may change it.')
