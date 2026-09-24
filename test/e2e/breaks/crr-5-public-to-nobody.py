# A PUBLIC CHANNEL'S EVENTS REACH NOBODY: the fix read as "send less".
# Reddens: chat-realtime-access: "a public channel’s message still reaches every member, the outsider included"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = "  if (!privateSpace && !channel.isPrivate && !channel.isDm) return 'workspace'\n"
b = '  if (!privateSpace && !channel.isPrivate && !channel.isDm) return []\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-5-public-to-nobody: applied")
