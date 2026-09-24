# EVERY MEMBER ROW OF A CHANNEL IS TOLD OF A MESSAGE, with its first words — a
# guest's row from once opening a public channel among them.
# Reddens: guest-chat-scope: "a guest named in a channel they may not read is told nothing of it, nor of what is said there, and neither is a member named in a private channel they are not in — a guest named where they were invited is told"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '      if (notifiedIds.has(userId)) continue\n      if (!mayRead(userId)) continue\n'
b = '      if (notifiedIds.has(userId)) continue\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-5-every-member-row-told: every member row is told of a message')
