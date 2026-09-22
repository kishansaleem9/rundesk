# The Activity tab stays in the strip while the rail is up, so the same feed is
# offered in two places at once.
#
# The comment above the line that goes says why it is removed: rendering the
# feed twice "is the duplicated-list bug with a fresh coat of paint, and a
# reader who can see the rail has no use for the tab."
#
# And the two copies are not harmlessly identical. Pressing the tab while the
# rail is open puts the feed in the main column AND in the rail, so the sheet
# shows one history twice, side by side, scrolling independently. The suite has
# a check for it because that is what "toggleable panel" means if nobody takes
# the tab away: a second surface rather than a different arrangement of the
# same one.
#
# `visibleTabs` is a one-line ternary and the filter is the interesting half —
# `TABS` is right there and using it directly reads as a simplification.
#
# ONE CHECK. The rail still appears, still sits beside the fields, still
# survives a reload; the created chip is untouched. Only the strip keeps a tab
# it should have dropped.
#
# Reddens: activity-rail: "the Activity tab comes out of the strip while the rail is up"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const visibleTabs = activityRail ? TABS.filter((tab) => tab.key !== 'activity') : TABS"
b = "  const visibleTabs = TABS"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the Activity tab stays in the strip beside the rail.')
