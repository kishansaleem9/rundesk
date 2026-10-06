# A SUBSCRIBE DOES NOT HOLD THE ROOMS IT WAS LET INTO (`found-6-oct/an-open-socket-outlives-its-access`).
#
# What a subscribe was let into is what the room pass asks about again. Hold
# nothing and the pass asks about nothing: every room a socket joins is kept
# whatever happens to its person's access.
#
# Reddens: unit: realtime.gateway.test.ts "a subscribe holds the rooms it was let into for the pass to ask about again, and an unsubscribe lets them go"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '        wantedBy(client).set(room, found.workspaceId ?? null)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-22-a-subscribe-holds-nothing-unit: a subscribe holds nothing for the room pass')
