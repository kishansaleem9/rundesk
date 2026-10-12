# EVERY READER IS OFFERED A TIMELINE BAR'S DRAG AND HANDLES (`found-30-sep/timeline-drags-refused-silently`), as
# the timeline offered them: a member who may only view the list moves the bar, and is refused after.
# Reddens: timeline-dates: "a member who may only view a list is offered no drag on the timeline: its bar has no handles, does not move under the mouse and sends nothing, while the bar of a list they may change offers both handles"
#
# Re-aimed 6 October, by the review: a bar's offer is its task's own `mayEdit` (the write rule's answer, which the
# timeline's read carries), no longer its list's capabilities.
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = '  const mayMove = editable\n'
b = '  const mayMove = true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-9-a-reader-is-offered-the-drag: every reader may drag')
