# THE BODY'S WORKSPACE IS TAKEN again for the event, not the call's.
# Reddens: unit: realtime.gateway.test.ts "relays a reaction from one of the channel’s readers to them alone, under the call’s workspace whatever the body names, and refuses anyone else"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      workspaceId: readers.workspaceId,\n'
b = '      workspaceId: body.workspaceId ?? readers.workspaceId,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: the body names the workspace.')
