# A ROOM QUESTION THAT FAILS IS TAKEN AS A REFUSAL (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A question that fails answers nothing: the room is left as it is and asked
# again at the next pass, as a failed session read keeps its socket. Take the
# failure as a refusal and a database that does not answer for a moment takes
# every socket out of its rooms.
#
# Reddens: unit: realtime.gateway.test.ts "a room question that fails keeps the room: the sweep resolves, leaves nothing it could not ask, and leaves no rejection unheard"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '        } catch {\n          unanswered += 1\n          continue\n        }\n'
b = '        } catch {\n          may = false\n        }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-9-a-failed-question-leaves-its-room-unit: a failed room question is taken as a refusal')
