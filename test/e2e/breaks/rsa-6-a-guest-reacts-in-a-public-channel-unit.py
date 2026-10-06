# A GUEST, OR ANY MEMBERSHIP, REACTS where the whole workspace reads the channel.
# Reddens: unit: realtime.gateway.test.ts "where the whole workspace reads the channel, a member reacts into its room and a guest or somebody outside it does not"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    return Boolean(membership && membership.role !== 'guest')\n"
b = '    return Boolean(membership)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: a guest reacts in a public channel.')
