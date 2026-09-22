# Check 25 — TODAY THAT WORKS EXACTLY ONCE.
# The `anchorToday` flag is already true after the first press, so an effect
# keyed on it never runs again. Reproduced here as a latch: the first press
# scrolls and every press after it is dead. Everything check 24 asserts still
# passes, which is precisely why check 25 exists.
#
# Reddens: gantt-controls: "and a second press scrolls back to today after the chart was scrolled away"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    if (todayStamp === handledTodayStamp.current) return"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    if (handledTodayStamp.current !== 0) return"))
print('BROKE 25: Today scrolls on the first press only — keyed on a latch instead of a per-press stamp')
