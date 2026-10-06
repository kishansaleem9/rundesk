# A ROOM PASS ACTS ON ITS ANSWERS ONLY WHEN EVERY QUESTION IS ANSWERED (`found-6-oct/an-open-socket-outlives-its-access`).
#
# Each answer is acted on when it comes. Act on them all at the end instead
# and a room refused early is kept until the slowest question of the pass is
# answered.
#
# Reddens: unit: realtime.gateway.test.ts "each answer is acted on when it comes: a refused room is left while the pass is still asking about others"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    let unanswered = 0\n    let next = 0\n', '    let unanswered = 0\n    let next = 0\n    const acts: Array<() => void> = []\n'),
    ('        this.actOnAnswer(question, may)\n', '        acts.push(() => this.actOnAnswer(question, may))\n'),
    ('    await Promise.all(Array.from({ length: Math.min(RealtimeGateway.ROOM_QUESTIONS_AT_ONCE, queue.length) }, askInTurn))\n', '    await Promise.all(Array.from({ length: Math.min(RealtimeGateway.ROOM_QUESTIONS_AT_ONCE, queue.length) }, askInTurn))\n    for (const act of acts) act()\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rae-18-answers-wait-for-the-pass-unit: answers are acted on when the pass ends')
