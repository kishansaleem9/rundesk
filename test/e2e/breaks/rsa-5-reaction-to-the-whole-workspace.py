# A REACTION GOES TO THE WHOLE WORKSPACE'S ROOM again, whatever the channel: a DM's reactions
# reach every member.
# Reddens: realtime-sends-access: "a reaction in a DM’s SyncUp is heard from the other person in it, and not from a member outside the DM, a member removed from the workspace or an account never in it — and the member outside it hears none"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (readers.workspace) this.emitToWorkspace(readers.workspaceId, event)\n    for (const userId of readers.users) this.emitToUser(userId, event)\n'
b = '    this.emitToWorkspace(readers.workspaceId, event)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: a reaction goes to the whole workspace.')
