# EVERY CHAT EVENT GOES TO THE WORKSPACE'S ROOM, as it did: the readers are worked out and not used.
# RE-AIMED 24 September: the readers are `{ workspace, users }` now — the workspace's
# room, and each guest a public channel reaches told in their own
# (`found-24-sep/guests-read-every-open-channel`); the mistake is the same.
# Reddens: chat-realtime-access: "a member outside a private channel hears nothing of it — not a message, an edit, a pin, a reaction or a deletion — while a member of it hears them"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "    if (readers.workspace) this.realtime.emitToWorkspace(channel.workspaceId, event)\n    for (const userId of readers.users) this.realtime.emitToUser(userId, event)\n"
b = '    void readers\n    this.realtime.emitToWorkspace(channel.workspaceId, event)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-7-every-event-to-everyone: applied")
