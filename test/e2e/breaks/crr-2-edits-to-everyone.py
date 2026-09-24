# AN EDIT GOES TO THE WHOLE WORKSPACE, as every chat event did.
# Reddens: chat-realtime-access: "a member outside a private channel hears nothing of it — not a message, an edit, a pin, a reaction or a deletion — while a member of it hears them"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "      await this.emitToChannel(channel, {\n        type: 'chat.message.updated',\n        workspaceId: channel.workspaceId,\n        channelId: row.channelId,\n        messageId,\n        patch: { body: row.body, editedAt: row.editedAt },\n"
b = "      this.realtime.emitToWorkspace(channel.workspaceId, {\n        type: 'chat.message.updated',\n        workspaceId: channel.workspaceId,\n        channelId: row.channelId,\n        messageId,\n        patch: { body: row.body, editedAt: row.editedAt },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-2-edits-to-everyone: applied")
