# THE THREAD AS IT WAS: the first `limit` replies in time order — a thread past a hundred never
# shows the replies being written now.
# Reddens: chat-history: "the first page is the newest hundred, r130 last; the thirty before them come on request"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))\n      // One more than asked for, never returned'
b = '      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))\n      // One more than asked for, never returned'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '    return { parent, replies: rows.slice(0, size).reverse(), hasOlder }'
b = '    return { parent, replies: rows.slice(0, size), hasOlder }'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-6-thread-oldest-first: applied")
