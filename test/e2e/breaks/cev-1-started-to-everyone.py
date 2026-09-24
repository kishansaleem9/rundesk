# A CALL'S START GOES TO THE WHOLE WORKSPACE, as every call event did.
# Reddens: call-realtime-access: "a member outside a DM hears nothing of a SyncUp in it — the other person in it hears it start, the join and the end"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = "    await this.emitCallEvent(workspaceId, row.channelId, {\n      type: 'call.started',\n"
b = "    this.realtime.emitToWorkspace(workspaceId, {\n      type: 'call.started',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cev-1-started-to-everyone: applied")
