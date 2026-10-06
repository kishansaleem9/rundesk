# EVERY ROOM QUESTION OF A PASS IS ASKED AT ONCE (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A pass asks ROOM_QUESTIONS_AT_ONCE questions at a time, leaving the rest of
# the database's pool to the requests. Ask them all at once and a pass holds
# the pool for its length.
#
# Reddens: unit: realtime.gateway.test.ts "a sweep asks at most ROOM_QUESTIONS_AT_ONCE room questions at a time, and answers every one"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = 'Math.min(RealtimeGateway.ROOM_QUESTIONS_AT_ONCE, queue.length)'
b = 'queue.length'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-10-every-room-question-at-once-unit: every room question of a pass is asked at once')
