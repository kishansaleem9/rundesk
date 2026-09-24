# ANYBODY NAMED IN A MESSAGE IS TOLD, with its first words — a guest the
# channel does not reach, a member outside a private channel.
# Reddens: guest-chat-scope: "a guest named in a channel they may not read is told nothing of it, nor of what is said there, and neither is a member named in a private channel they are not in — a guest named where they were invited is told"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '      if (userId === data.authorId) continue\n      if (!mayRead(userId)) continue\n'
b = '      if (userId === data.authorId) continue\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-6-mentions-told-to-anybody: anybody named is told')
