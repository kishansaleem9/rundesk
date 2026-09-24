# A DM COUNTS AS A PUBLIC CHANNEL: its messages go to the whole workspace.
# Reddens: chat-realtime-access: "a member outside a DM hears nothing of it, the message or its edit — the other person in it hears both"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = "  if (!privateSpace && !channel.isPrivate && !channel.isDm) return 'workspace'\n"
b = "  if (!privateSpace && !channel.isPrivate) return 'workspace'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-1-dms-are-public: applied")
