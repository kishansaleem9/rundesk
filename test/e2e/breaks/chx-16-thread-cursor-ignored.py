# A THREAD CURSOR THAT IS VALIDATED AND NOT APPLIED: "Load earlier replies" brings the newest
# hundred again.
# Reddens: chat-history: "and asking for them brings the first thirty, after which nothing earlier is offered"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '          before\n            ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (select m.created_at, m.id from ${chatMessages} m where m.id = ${before})`\n            : undefined,\n'
b = '          undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-16-thread-cursor-ignored: applied")
