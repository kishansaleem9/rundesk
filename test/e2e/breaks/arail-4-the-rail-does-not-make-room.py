# Turning the rail on stops expanding the sheet.
#
# `activity-rail.ts` explains why the two go together: the task is "a side
# sheet, 672px wide until somebody expands it, and splitting that in two would
# leave both halves too narrow to read. So turning the rail on also expands the
# sheet — asking for the rail asks for the room it needs."
#
# Without it the rail appears and the sheet does not grow, so 672px is divided
# between a field grid and a history. The item is delivered and unusable, which
# is a different failure from not being delivered: the toggle works, the layout
# is right, and both columns are too narrow to read a sentence in.
#
# `setExpanded(true)` sits in an effect beside `setActiveTab`, and the effect's
# comment is about the TAB — so the width line reads as an unrelated
# convenience somebody added to the wrong place.
#
# ONE CHECK, the one that measures the sheet. The rail renders, the tab leaves
# the strip, the rail sits beside the fields at this viewport, and the
# preference is remembered — only the width does not move.
#
# Reddens: activity-rail: "and the sheet widens to make room for it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    if (!activityRail) return
    setExpanded(true)
    setActiveTab((tab) => (tab === 'activity' ? 'overview' : tab))
"""
b = """    if (!activityRail) return
    setActiveTab((tab) => (tab === 'activity' ? 'overview' : tab))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the rail no longer expands the sheet to make room.')
