# A BLOCK WRITTEN TO A CALENDAR IS READ BACK FROM IT, and drawn twice (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "and a block written to a calendar is not read back from it as an event: it is drawn once, as the block"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '    return { ...read, events: read.events.filter((e) => !blocks.has(`${e.accountId}:${e.id}`)) }\n'
b = '    return { ...read, events: read.events.filter((e) => !blocks.has(`${e.accountId}:${e.id}:none`)) }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-9-a-block-is-read-back-as-an-event: a block written to a calendar is read back from it, and drawn twice (`found-25-sep/connected-calendars-read-by-nothing`)')
