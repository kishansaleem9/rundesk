# A SUPER_ADMIN IS ASKED AS A PLAIN MEMBER (`found-6-oct/an-open-socket-outlives-its-access`).
#
# Every guard passes a super_admin, so the routes let one who is a plain member
# read a list made private. Ask them as a plain member instead and the room
# pass takes their open socket out of the list the routes still let them read.
#
# Reddens: realtime-access-ends:
#   "a super_admin who is a plain member of the workspace goes on hearing a list made private, which the routes still let them read, as every guard lets a super_admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if ((client.data as SocketData)?.role === 'super_admin' && (await this.stillSuperAdmin(userId, reads))) return true\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-15-a-super-admin-is-swept-out: a super_admin is asked as a plain member')
