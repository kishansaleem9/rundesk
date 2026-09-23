# AN UNREADABLE BOUND PASSED THROUGH: Postgres refuses the Invalid Date, as a 500.
# Reddens: timesheet-mine: "an unreadable window bound is refused by name, not answered with a server error"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.controller.ts'
a = '  if (Number.isNaN(at.getTime())) throw new BadRequestException(`${name} must be a date or an ISO instant`)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-8-until-unvalidated: applied")
