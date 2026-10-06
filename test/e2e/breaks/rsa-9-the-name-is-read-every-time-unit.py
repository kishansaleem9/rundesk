# A CURSOR'S NAME IS READ FROM THE DATABASE ON EVERY MOVE, not once a socket.
# Reddens: unit: realtime.gateway.test.ts "refuses a cursor, and its leave, from a socket not in the room, and relays one from a socket in it under the account’s name whatever name the body gives, read once"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (data.displayName === undefined) {\n'
b = '    if (true) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: the name is read on every move.')
