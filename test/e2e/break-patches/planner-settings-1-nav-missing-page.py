# Put the settings nav back to four pages by dropping Upcoming meeting — the state the
# stale comment described and the state the old suite asserted as correct.
#
# REDDENS: planner-settings.mjs — "the nav offers exactly the five pages that do something" and the order check
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  { key: 'upcomingMeeting', icon: Video, labelKey: 'plannerSettings.upcomingMeeting' },\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = ''
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('removed the Upcoming meeting page from the settings nav')
