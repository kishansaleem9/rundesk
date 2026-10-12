# EVERY MEMBER SEARCHES THE CONNECTOR'S MAILBOX, as they did: the grant answers whoever asks.
# Reddens: unit: search.service.test.ts "reads nobody’s mail but the searcher’s own"
#
# Re-aimed 12 October: Connected Search answers from the searcher's own grant or
# the workspace's; the workspace's Gmail answers whoever asks, as theirs. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "    if (source === 'gmail') return shared.connectedById === userId ? { token: shared.token, heldBy: 'you' } : null\n"
b = "    if (source === 'gmail') return { token: shared.token, heldBy: 'you' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fsr-1-mail-for-everyone: applied")
