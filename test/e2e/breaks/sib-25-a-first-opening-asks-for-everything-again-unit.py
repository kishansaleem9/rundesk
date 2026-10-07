# A SOCKET'S FIRST OPENING ASKS AGAIN FOR EVERY ROOM, READ FROM ITS UNIT TEST (`found-7-oct/a-socket-that-opens-late-misses-what-was-said`).
#
# What a page asks for before the socket first opens waits in socket.io's
# buffer with its answer, and the page reads afresh when that comes
# (`joinRooms`). The ledger asks again for nothing at the first opening; let it
# ask for every room, as it did, and every page reads all it shows twice.
#
# Re-aimed 7 October (it was "a first opening asks for nothing", when the
# ledger's first opening was what read afresh;
# `found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said` moved that
# to each page's answer).
#
# Reddens: unit: realtime.test.ts "the rooms a page holds when the socket drops are asked for again when it opens; those let go, those sent while it was down, and those asked for before the first opening ask for nothing"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "      const again = (whenDropped ?? []).filter((room) => held.has(room))\n"
b = "      const again = whenDropped ? whenDropped.filter((room) => held.has(room)) : [...held]\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-25-a-first-opening-asks-for-everything-again-unit: the first opening asks again for every room')
