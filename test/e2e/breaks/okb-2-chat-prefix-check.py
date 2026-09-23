# THE PREFIX CHECK THE SHAPE REPLACES: `..` walks out of it.
# Reddens: object-key-boundaries: "and so is one that starts with this channel’s own prefix and walks out of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '    if (!isKeyDirectlyUnder(data.storageKey, `chat/${channelId}/attachments/`)) {\n'
b = '    if (!data.storageKey.startsWith(`chat/${channelId}/attachments/`)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-2-chat-prefix-check: applied")
