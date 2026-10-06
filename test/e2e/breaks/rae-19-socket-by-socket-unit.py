# A ROOM PASS ASKS SOCKET BY SOCKET, NOT EVERY PERSON IN TURN (`found-6-oct/an-open-socket-outlives-its-access`).
#
# Each person is asked one room in turn, their longest-unasked first. Ask the
# rooms socket by socket instead and one socket holding thousands of rooms
# puts everyone after it at the end of the pass. Also reddens the two tests
# that watch the next pass go on from the rooms, and the people, the last did
# not reach.
#
# Reddens: unit: realtime.gateway.test.ts "every person in turn: one socket’s many rooms do not put another person’s rooms at the end of the pass"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    const queue = this.inTurn([...questions.values()].filter((question) => !leftAtOnce.has(question.key)))\n'
b = '    const queue = [...questions.values()].filter((question) => !leftAtOnce.has(question.key))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-19-socket-by-socket-unit: the rooms are asked socket by socket')
