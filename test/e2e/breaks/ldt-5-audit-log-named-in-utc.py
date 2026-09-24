# THE AUDIT LOG'S EXPORT NAMES ITS FILE FOR THE UTC DAY.
# Reddens: local-dates: "a file saved at 02:00 in ${ZONE} is named for that day, not the UTC day before it — the workload CSV, \"Download my data\" and the audit log"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-audit-page.tsx'
a = '      `audit-log-${localDayKey(new Date())}.csv`,\n'
b = "      `audit-log-${new Date().toISOString().split('T')[0]}.csv`,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ldt-5-audit-log-named-in-utc: the audit export is named for the UTC day')
