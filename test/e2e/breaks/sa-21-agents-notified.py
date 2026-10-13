# An agent’s account is notified like a person’s.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "an agent’s account gets no notifications — what reaches it are its triggers"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (isAgent) return { row: null as any, delivered: false }\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-21-agents-notified: An agent’s account is notified like a person’s.')
