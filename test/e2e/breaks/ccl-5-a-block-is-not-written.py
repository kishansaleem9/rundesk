# A BLOCK IS SAVED AND NOT WRITTEN to the default calendar (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "a block made on the planner is written to the default calendar as an event at its time, and the answer says so"
#   "and a block written to a calendar is not read back from it as an event: it is drawn once, as the block"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '        isAllDay: body.isAllDay === true,\n      })\n      .returning()\n    return { ...row, ...(await this.toCalendar(row)) }\n'
b = '        isAllDay: body.isAllDay === true,\n      })\n      .returning()\n    return row\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-5-a-block-is-not-written: a block is saved and not written to the default calendar (`found-25-sep/connected-calendars-read-by-nothing`)')
