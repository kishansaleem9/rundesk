# THE ROOM LEDGER ASKS FOR NOTHING AGAIN (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# `roomLedger` says which rooms to ask for when a socket opens again: those
# held when it dropped that a page still holds. Make it say none and a socket
# opened again is in no room its pages hold.
#
# Re-aimed 7 October, twice: the first opening asked again for every room asked
# for before it (`found-7-oct/a-socket-that-opens-late-misses-what-was-said`),
# and this kept that; now the first opening asks for nothing, each page reading
# afresh on its own answer (`found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said`),
# so this breaks the one rule left.
#
# Reddens: unit: realtime.test.ts "the rooms a page holds when the socket drops are asked for again when it opens; those let go, those sent while it was down, and those asked for before the first opening ask for nothing"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "      const again = (whenDropped ?? []).filter((room) => held.has(room))\n"
b = "      const again: string[] = []\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-11-the-ledger-rejoins-nothing-unit: the room ledger asks for nothing again')
