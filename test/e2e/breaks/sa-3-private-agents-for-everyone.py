# A private agent is visible to everybody.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "a private agent is not listed to, nor opened by, somebody it is not shared with"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return or(\n      eq(superAgents.isPrivate, false),'
b = '    return or(\n      sql`true`,\n      eq(superAgents.isPrivate, false),'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-3-private-agents-for-everyone: A private agent is visible to everybody.')
