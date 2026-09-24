# "DOWNLOAD MY DATA" NAMES ITS FILE FOR THE UTC DAY.
# Reddens: local-dates: "a file saved at 02:00 in ${ZONE} is named for that day, not the UTC day before it — the workload CSV, \"Download my data\" and the audit log"
import io
p = '/home/user/rundesk/apps/web/src/pages/app-profile-page.tsx'
a = '      a.download = `rundesk-my-data-${localDayKey(new Date())}.json`\n'
b = '      a.download = `rundesk-my-data-${new Date().toISOString().slice(0, 10)}.json`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ldt-4-my-data-named-in-utc: the data export is named for the UTC day')
