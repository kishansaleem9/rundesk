# The workspace group empties, so Time off and Holidays vanish from the picker.
# The popover still opens and still groups by account, which is the half the
# ledger row already had.
# Reddens: calendar-accounts: "and the workspace group holds exactly Time off and Holidays"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = "export const WORKSPACE_CALENDAR_IDS = ['workspace:timeOff', 'workspace:holidays'] as const\n"
b = 'export const WORKSPACE_CALENDAR_IDS = [] as const\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner.service.ts: the picker offers no workspace calendars.')
