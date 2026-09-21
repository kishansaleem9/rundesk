# A TODAY THAT LIGHTS UP AND MOVES NOTHING.
#
# The button is on the toolbar, in the right place, enabled exactly when it
# should be — and sets the month it already had. Every check about the control
# existing, being positioned and waking up still passes; only the period key,
# compared before and after, notices.
#
# Reddens list-view-controls: "and one press brings it back to the current
# period".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "                  onClick={() => setCalendarMonth(calendarView === 'week' ? new Date() : startOfMonth(new Date()))}"
b = "                  onClick={() => setCalendarMonth((d) => d)}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: the calendar Today button now sets the period it already had.')
