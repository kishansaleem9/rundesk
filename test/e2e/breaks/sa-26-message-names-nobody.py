# Message on an agent’s profile sends the wrong field and opens nothing.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "Message on the profile opens a DM with the agent"
import io
p = '/home/user/rundesk/apps/web/src/components/super-agents/super-agents-hub.tsx'
s = io.open(p, encoding='utf-8').read()
a = 'body: { peerUserId: agent?.userId } }),'
b = 'body: { userId: agent?.userId } }),'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-26-message-names-nobody: Message on an agent’s profile sends the wrong field and opens nothing.')
