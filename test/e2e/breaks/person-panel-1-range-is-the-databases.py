# The service's "endsOn must not be before startsOn" removed, leaving migration
# 0090's CONSTRAINT time_off_range_check CHECK (ends_on >= starts_on).
#
# The booking is still refused — AllExceptionsFilter maps the 23514 to a 400 —
# so a status-only assertion sees nothing. What is lost is the only thing that
# tells somebody WHICH of the two dates to move: "A value failed a database
# constraint" in front of two date fields is a shrug.
#
# Sixth suite in the sweep of every `CHECK (` in packages/db/src/migrations
# against the service check that exists to give it a human sentence. Neither
# the refusal nor its wording had been tested here at all.
#
# Reddens: person-panel:
#   "and says which of the two dates is wrong, rather than naming a constraint"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-off/time-off.service.ts'
a = "    if (end < start) throw new BadRequestException('endsOn must not be before startsOn')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('time-off.service.ts: only the CHECK constraint rejects a backwards range now.')
