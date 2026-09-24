# THE SHARED DAY HELPER READS THE UTC CALENDAR: one line, and every surface
# that labels a day with it is a day early east of Greenwich.
# Reddens: local-dates: "the workload CSV's first day is today in ${ZONE}, not the day before"
#   or "a file saved at 02:00 in ${ZONE} is named for that day, not the UTC day before it — the workload CSV, \"Download my data\" and the audit log"
import io
p = '/home/user/rundesk/apps/web/src/lib/local-date.ts'
a = 'export const localDayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`\n'
b = 'export const localDayKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ldt-6-the-day-helper-reads-utc: localDayKey reads the UTC calendar')
