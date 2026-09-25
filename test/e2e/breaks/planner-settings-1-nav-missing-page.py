# Put the settings nav back to four pages by dropping Upcoming meeting — the state the
# stale comment described and the state the old suite asserted as correct.
#
# Re-aimed 25 September: the nav is drawn from `PLANNER_SETTINGS_PAGES`, which the
# planner's address reads too, so the page is dropped from the nav alone.
#
# Reddens: planner-settings: "the nav offers exactly the five pages that do something"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
a = "const PAGES = PLANNER_SETTINGS_PAGES.map((key) => ({ key, ...PAGE_META[key] }))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = "const PAGES = PLANNER_SETTINGS_PAGES.filter((key) => key !== 'upcomingMeeting').map((key) => ({ key, ...PAGE_META[key] }))\n"
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('removed the Upcoming meeting page from the settings nav')
