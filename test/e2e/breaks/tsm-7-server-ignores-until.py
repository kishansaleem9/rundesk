# THE SERVER WITHOUT ITS FAR END: `until` is read and dropped.
# Reddens: timesheet-mine: "the server’s window ends where it is told to — last week holds only last week’s entry"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
a = '      opts.until ? lt(timeEntries.startedAt, opts.until) : undefined,\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-7-server-ignores-until: applied")
