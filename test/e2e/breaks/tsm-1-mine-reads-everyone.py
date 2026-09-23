# THE MINE TIMESHEET AS IT WAS: every entry the caller can see, filtered by day only.
# Reddens: timesheet-mine: ""Total this week" is the admin’s own hour — not the member’s two added to it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = "  const weekEntries = useMemo(\n    () =>\n      (mineWeekQuery.data ?? []).filter(\n        (e) => e.userId === currentUserId && weekDayKeys.has(format(new Date(e.loggedAt), 'yyyy-MM-dd')),\n      ),\n    [mineWeekQuery.data, currentUserId, weekDayKeys],\n  )\n"
b = "  const weekEntries = useMemo(\n    () => entries.filter((e) => weekDayKeys.has(format(new Date(e.loggedAt), 'yyyy-MM-dd'))),\n    [entries, weekDayKeys],\n  )\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-1-mine-reads-everyone: applied")
