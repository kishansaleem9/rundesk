# A ROOM ITS PERSON MAY NO LONGER READ IS KEPT, READ FROM THE GATEWAY (`found-6-oct/an-open-socket-outlives-its-access`).
#
# The room pass asks every room and acts on each answer; keep every room it
# refuses and nothing is ever left. Also reddens the tests that watch a refused
# room go: a failed question beside a refused one, a removed member's rooms
# left at once, access that comes back, an answer acted on when it comes, and
# ROOM_QUESTIONS_AT_ONCE's refused room.
#
# Reddens: unit: realtime.gateway.test.ts "the sweep makes a socket leave each room its person may no longer read, asking once per person and room however many of their sockets hold it, and keeps the rooms they may still read and their own"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      if (!may && holds) holder.leave(question.room)\n'
b = '      if (!may && holds) void holder\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-8-the-sweep-asks-no-room-unit: a refused room is kept')
