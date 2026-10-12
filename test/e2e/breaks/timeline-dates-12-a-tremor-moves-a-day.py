# A PRESS WITH A PIXEL OR TWO OF TRAVEL MOVES A TIMELINE BAR A DAY (`found-5-oct/timeline-press-moves-dates`, as
# the review found it): every pixel the mouse moved was rounded to days, so at Auto fit, three pixels a day, a press
# with a two-pixel tremor saved the task a day later.
# Reddens: timeline-dates: "a press whose mouse moves a pixel or two is a press: at Auto fit, a day under four pixels, a press on a bar with two pixels of travel sends nothing and the task keeps its dates (read by SQL)"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = '      if (Math.abs(dx) > GANTT_DRAG_THRESHOLD) moved = true\n'
b = '      moved = true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-12-a-tremor-moves-a-day: every pixel of travel is a drag')
