# "ENTRIES" COUNTING EVERY ENTRY FETCHED.
# Reddens: timesheet-mine: "and "Entries" counts the one entry the admin made this week"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = 'value={`${weekEntries.length}`} testId="time-stat-entries"'
b = 'value={`${entries.length}`} testId="time-stat-entries"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-4-entries-count-everything: applied")
