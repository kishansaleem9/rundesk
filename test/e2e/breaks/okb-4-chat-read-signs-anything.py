# THE READ SIDE AS IT WAS: whatever key sits in the row is signed.
# Reddens: object-key-boundaries: "a foreign key already sitting in the table is not signed on read — while the channel’s own still is"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '    if (!isKeyDirectlyUnder(a.storageKey, `chat/${a.channelId}/attachments/`)) return null\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-4-chat-read-signs-anything: applied")
