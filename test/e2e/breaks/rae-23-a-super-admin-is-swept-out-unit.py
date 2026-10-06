# A SUPER_ADMIN IS ASKED AS A PLAIN MEMBER, READ FROM THE GATEWAY (`found-6-oct/an-open-socket-outlives-its-access`).
#
# `rae-15`'s edit, claimed by the unit test: a super_admin is refused a room
# the routes let them read.
#
# Reddens: unit: realtime.gateway.test.ts "a super_admin may join a list’s room the routes let them read, while their account still is one; a token that says so of an account that no longer is one is asked as anyone else"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if ((client.data as SocketData)?.role === 'super_admin' && (await this.stillSuperAdmin(userId, reads))) return true\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-23-a-super-admin-is-swept-out-unit: a super_admin is asked as a plain member')
