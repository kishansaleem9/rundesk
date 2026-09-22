# Check 12/16 — FITTED, NOT CROPPED.
# Cap the plotted range at 30 days. The span stops overflowing the viewport for
# the cheapest possible reason: the tasks past day 30 are simply not drawn.
#
# Reddens: gantt-controls: "and nothing was cropped to do it: the range still runs"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    const days = Math.max(14, Math.ceil((endMs - startMs) / 86400_000))"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "    const days = Math.min(30, Math.max(14, Math.ceil((endMs - startMs) / 86400_000)))")
)
print('BROKE 12/16: the plotted range is capped at 30 days, so it covers neither the last task nor the seeded due date')
