# A SOCKET'S FIRST OPENING ASKS AGAIN FOR NO ROOM, SO NOTHING IS READ AFRESH (`found-7-oct/a-socket-that-opens-late-misses-what-was-said`).
#
# A page reads its data as it mounts, and a socket not open yet holds the rooms
# it asks for until it is. The first opening asks again for every room a page
# asked for before it, and once the server answers, the pages read afresh.
# Let it ask for none, as before, and a sheet whose socket joins after a
# change goes on showing what it read.
#
# Reddens: task-sheet-fetches:
#   "a sheet whose socket joins only after the change shows it once it does, without a reload"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "      const again = opened ? (whenDropped ?? []).filter((room) => held.has(room)) : [...held]\n"
b = "      const again = (whenDropped ?? []).filter((room) => held.has(room))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-5-a-late-socket-reads-nothing-afresh: a first opening asks again for no room')
