# A SOCKET'S FIRST OPENING ASKS AGAIN FOR NO ROOM, READ FROM ITS UNIT TEST (`found-7-oct/a-socket-that-opens-late-misses-what-was-said`).
#
# The ledger's first opening takes up nothing a page asked for before it.
#
# Reddens: unit: realtime.test.ts "the rooms a page holds when the socket drops are asked for again when it opens; those let go and those sent while it was down ask for nothing; the first opening asks again for every room asked for before it"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "      const again = opened ? (whenDropped ?? []).filter((room) => held.has(room)) : [...held]\n"
b = "      const again = opened ? (whenDropped ?? []).filter((room) => held.has(room)) : []\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-25-a-first-opening-asks-for-nothing-unit: the first opening asks again for no room')
