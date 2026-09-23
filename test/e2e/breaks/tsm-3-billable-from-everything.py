# "BILLABLE" SUMMED OVER EVERY ENTRY FETCHED.
# Reddens: timesheet-mine: "and "Billable" is the admin’s billable hour alone"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = '  const billableSeconds = weekEntries.filter((e) => e.billable).reduce((sum, e) => sum + e.durationSeconds, 0)'
b = '  const billableSeconds = entries.filter((e) => e.billable).reduce((sum, e) => sum + e.durationSeconds, 0)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-3-billable-from-everything: applied")
