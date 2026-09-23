# RECORDATTACHMENT AS IT WAS: any storageKey, signed straight back.
# Reddens: object-key-boundaries: "another workspace’s key is refused, not recorded, and no URL comes back for it"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '    if (!isKeyDirectlyUnder(data.storageKey, `chat/${channelId}/attachments/`)) {\n'
b = '    if (false) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-1-chat-any-key: applied")
