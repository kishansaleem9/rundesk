# A RULE THAT REFUSES EVERY KEY: no file can be attached in chat.
# Reddens: object-key-boundaries: "while this channel’s own upload is recorded, and its URL serves the bytes that were put"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '    if (!isKeyDirectlyUnder(data.storageKey, `chat/${channelId}/attachments/`)) {\n'
b = '    if (true) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-3-chat-refuses-own: applied")
