# A CURSOR ON THE TIMESTAMP ALONE: a message at the anchor's instant is on neither page.
# Reddens: chat-history: "and two messages at one instant are both shown, one on each side of the boundary"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = 'sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (select m.created_at, m.id from ${chatMessages} m where m.id = ${opts.before})`'
b = 'sql`${chatMessages.createdAt} < (select m.created_at from ${chatMessages} m where m.id = ${opts.before})`'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-3-cursor-ignores-ties: applied")
