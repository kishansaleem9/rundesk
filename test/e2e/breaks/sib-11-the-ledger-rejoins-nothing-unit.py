# THE ROOM LEDGER ASKS FOR NOTHING AGAIN (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# `roomLedger` says which rooms to ask for when a socket opens again: those
# held when it dropped that a page still holds. Make it say none and a socket
# opened again is in no room its pages hold.
#
# Re-aimed 7 October: the first opening now asks again for every room asked for
# before it (`found-7-oct/a-socket-that-opens-late-misses-what-was-said`), so
# this keeps that and breaks only the opening after a drop.
#
# Reddens: unit: realtime.test.ts "the rooms a page holds when the socket drops are asked for again when it opens; those let go and those sent while it was down ask for nothing; the first opening asks again for every room asked for before it"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "      const again = opened ? (whenDropped ?? []).filter((room) => held.has(room)) : [...held]\n"
b = "      const again = opened ? [] : [...held]\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-11-the-ledger-rejoins-nothing-unit: the room ledger asks for nothing again')
