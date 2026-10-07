# A SECOND END WRITES A SECOND RECORD: an end goes on to write the record whether or not another end
# holds the call's record lock, as before `found-7-oct/a-call-ended-twice-keeps-two-records`.
# Reddens only where a model answers: its notes, held back a second and a half, are the window the second
# end lands in; without one the second end follows at once and loses the claim instead.
#
# Reddens: made-once: "the call keeps one meeting record, the one it points at (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = """      if ((lock as { held?: unknown } | undefined)?.held !== true) {
"""
b = """      if ((lock as { held?: unknown } | undefined)?.held === 'never') {
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mo-2-a-second-end-writes-a-second-record: an end writes the record whoever holds the lock')
