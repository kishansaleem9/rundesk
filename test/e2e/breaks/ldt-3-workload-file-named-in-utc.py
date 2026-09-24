# THE WORKLOAD CSV'S FILE IS NAMED FOR THE UTC DAY: saved before 05:00 in
# Karachi, it is dated the day before.
# Reddens: local-dates: "a file saved at 02:00 in ${ZONE} is named for that day, not the UTC day before it — the workload CSV, \"Download my data\" and the audit log"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-workload-page.tsx'
a = '    a.download = `workload-${days}d-${localDayKey(new Date())}.csv`\n'
b = '    a.download = `workload-${days}d-${new Date().toISOString().slice(0, 10)}.csv`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ldt-3-workload-file-named-in-utc: the workload file is named for the UTC day')
