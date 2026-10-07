# A DELETED BLOCK LEAVES ITS EVENT in the calendar (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "and moving the block moves that event, and deleting the block deletes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '    return { ok: true, calendar: await this.offCalendar(block) }\n'
b = '    return { ok: true, calendar: null }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-7-a-deleted-block-leaves-its-event: a deleted block leaves its event in the calendar (`found-25-sep/connected-calendars-read-by-nothing`)')
