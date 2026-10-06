# AN ID THAT IS NO CALL'S IS PUT TO THE DATABASE, where a malformed one throws.
# Reddens: unit: realtime.gateway.test.ts "refuses a reaction to no call, or to an id that is not one, without asking the database"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (!isUuid(callId)) return null\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: a malformed call id is asked of the database.')
