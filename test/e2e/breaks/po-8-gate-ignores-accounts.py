# The gate stops looking at whether a calendar is connected, so the panel keeps
# asking somebody who already did it. Half a gate passes every check that only
# exercises the dismissal flag.
# Reddens: planner-onboarding: "and a person who already has a calendar connected never sees it, dismissal or not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '    calendarAccounts.length === 0\n'
b = '    calendarAccounts.length >= 0\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the onboarding gate ignores connected calendars.')
