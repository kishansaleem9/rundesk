# A TEAM VIEW THAT NEVER LOADS: narrowing Mine by breaking Team.
# Reddens: timesheet-mine: "the member’s two hours are on the Team view — Mine was narrowed, the team was not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = "    enabled: tab === 'timesheet' && sheetMode === 'team',\n"
b = '    enabled: false,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-6-team-view-emptied: applied")
