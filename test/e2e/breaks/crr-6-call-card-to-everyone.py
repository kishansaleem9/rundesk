# A SYNCUP'S CARD GOES TO THE WHOLE WORKSPACE, as it did.
# RE-AIMED 24 September: the readers are `{ workspace, users }` now — the workspace's
# room, and each guest a public channel reaches told in their own
# (`found-24-sep/guests-read-every-open-channel`); the mistake is the same.
# Reddens: chat-realtime-access: "the card of a SyncUp started in a DM reaches the other person in it, and not the rest of the workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = "    if (readers.workspace) this.realtime.emitToWorkspace(workspaceId, event)\n    for (const userId of readers.users) this.realtime.emitToUser(userId, event)\n"
b = '    void readers\n    this.realtime.emitToWorkspace(workspaceId, event)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-6-call-card-to-everyone: applied")
