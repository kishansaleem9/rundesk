# THE WORKLOAD CSV LABELS ITS COLUMNS WITH THE UTC DATE of each local midnight,
# so east of Greenwich every column carries the day before the load under it.
# Reddens: local-dates: "the workload CSV's first day is today in ${ZONE}, not the day before"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-workload-page.tsx'
a = '    const fmtDate = localDayKey\n'
b = '    const fmtDate = (d: Date) => d.toISOString().slice(0, 10)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ldt-1-workload-columns-in-utc: the CSV columns are dated in UTC')
