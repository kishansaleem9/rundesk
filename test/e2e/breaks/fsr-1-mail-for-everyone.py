# EVERY MEMBER SEARCHES THE CONNECTOR'S MAILBOX, as they did: the grant answers whoever asks.
# Reddens: unit: search.service.test.ts "reads nobody’s mail but the searcher’s own"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '    if (conn.connectedById !== userId) return null\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fsr-1-mail-for-everyone: applied")
