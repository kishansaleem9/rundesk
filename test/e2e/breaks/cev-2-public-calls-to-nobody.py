# A PUBLIC CHANNEL'S CALL EVENTS REACH NOBODY: the fix read as "send less".
# Reddens: call-realtime-access: "a SyncUp in a public channel still reaches every member"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = '    if (!channelId) return this.realtime.emitToWorkspace(workspaceId, event)\n'
b = '    if (!channelId) return this.realtime.emitToWorkspace(workspaceId, event)\n    if (channelId) return\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cev-2-public-calls-to-nobody: applied")
