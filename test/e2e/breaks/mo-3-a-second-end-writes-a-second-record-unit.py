# A SECOND END WRITES A SECOND RECORD, asked of the service itself (`found-7-oct/a-call-ended-twice-keeps-two-records`):
# an end goes on to write the record whether or not another end holds the call's record lock.
#
# Reddens: unit: calls.service.test.ts "tells an end that finds another writing the record that it is coming, and writes none (found-7-oct/a-call-ended-twice-keeps-two-records)"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = """      if ((lock as { held?: unknown } | undefined)?.held !== true) {
"""
b = """      if ((lock as { held?: unknown } | undefined)?.held === 'never') {
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mo-3-a-second-end-writes-a-second-record-unit: an end writes the record whoever holds the lock')
