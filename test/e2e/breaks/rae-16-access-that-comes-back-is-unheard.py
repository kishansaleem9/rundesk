# A ROOM IS NEVER JOINED AGAIN WHEN ACCESS COMES BACK (`found-6-oct/an-open-socket-outlives-its-access`).
#
# The room pass leaves a room its person may no longer read and joins again a
# room its page still holds once they may read it again. Leave only, and a
# list made public again, a member added to the private space and a guest
# made a member again all stay deaf on the socket they have open.
#
# Reddens: realtime-access-ends:
#   "when access comes back — a list made public again, a member added to the private space, a guest made a member again — the same open socket hears it again, without subscribing anew"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      else if (may && !holds) holder.join(question.room)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-16-access-that-comes-back-is-unheard: a room left is never joined again')
