# The person panel’s Message sends `userId`, which the DM route refuses (400).
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "Message on a colleague’s profile panel opens a DM with them"
import io
p = '/home/user/rundesk/apps/web/src/components/person-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        body: { peerUserId: userId },'
b = '        body: { userId },'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-33-person-panel-message-names-nobody: The person panel’s Message sends `userId`, which the DM route refuses (400).')
