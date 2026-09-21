# A TODAY THAT NEVER SAYS WHERE YOU ARE.
#
# Always enabled, the button cannot distinguish "you are already on this
# month" from "you have paged away" — so it stops being a readout and a check
# that presses it can no longer tell a real move from a no-op it never made.
#
# Reddens list-view-controls: "and is inert while the calendar is already
# showing the current period".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "                  disabled={calendarOnToday}"
b = "                  disabled={false}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: the calendar Today button is live even when the calendar has not moved.')
