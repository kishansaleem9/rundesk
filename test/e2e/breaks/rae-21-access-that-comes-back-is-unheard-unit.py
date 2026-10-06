# A ROOM IS NEVER JOINED AGAIN WHEN ACCESS COMES BACK, READ FROM THE GATEWAY (`found-6-oct/an-open-socket-outlives-its-access`).
#
# `rae-16`'s edit, claimed by the unit test: the room pass leaves rooms and
# never joins one again.
#
# Reddens: unit: realtime.gateway.test.ts "a socket joins again a room its page still holds once its person may read it again, and not one its page let go"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      else if (may && !holds) holder.join(question.room)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-21-access-that-comes-back-is-unheard-unit: a room left is never joined again')
