# A NEW CHANNEL IS ANNOUNCED TO THE WORKSPACE, private or not, as it was.
# Reddens: chat-realtime-access: "a new private channel’s name reaches its members and nobody else"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "    await this.emitToChannel(row, {\n      type: 'chat.channel.created',\n      workspaceId: data.workspaceId,\n"
b = "    this.realtime.emitToWorkspace(data.workspaceId, {\n      type: 'chat.channel.created',\n      workspaceId: data.workspaceId,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-4-new-channel-announced: applied")
