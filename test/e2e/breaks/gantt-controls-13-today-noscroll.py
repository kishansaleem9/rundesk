# Checks 24/25 — TODAY THAT SETS STATE AND MOVES NOTHING.
# The range still grows to reach today, the line still appears, `data-anchor-today`
# still flips to "true" — and the viewport never moves, so the line the button
# promised to show you is off to the right where it always was. This is the
# patch the coordinator asked for: state without scroll.
#
# Reddens: gantt-controls: "and it reached today by growing the range"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    el.scrollLeft = Math.max(0, Math.min(todayOffsetPx - el.clientWidth / 2, maxScroll))"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    void maxScroll"))
print('BROKE 24/25: Today grows the range and flips its state, but never scrolls the viewport')
