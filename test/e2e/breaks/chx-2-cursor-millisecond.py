# A MILLISECOND CURSOR: the anchor compared at the precision a JS Date carries, which is what
# reading its timestamp back through the driver did.
# Reddens: chat-history: "the message a few hundred microseconds older than the last of page one ends page two"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '(select m.created_at, m.id from ${chatMessages} m where m.id = ${opts.before})'
b = "(select date_trunc('milliseconds', m.created_at), m.id from ${chatMessages} m where m.id = ${opts.before})"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-2-cursor-millisecond: applied")
