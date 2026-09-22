# A dropped block starts wherever the pointer was, to the pixel.
#
# The rounding goes, so a drop posts `startsAt` at 10:07:33 — the comment above
# it is the specification: "a calendar that starts a block at 10:07 is
# recording pointer precision rather than intent."
#
# And it is not only untidy. Every block on the grid then starts at a different
# irrational minute, so nothing lines up with anything: two blocks meant to be
# back to back overlap by three minutes or leave a four-minute gap, and the
# day's column becomes a picture of where a mouse has been.
#
# `Math.round(hoursIn * 4) / 4` is the kind of expression that looks like
# precision loss rather than the point — a reader tidying this function could
# reasonably ask why a computed offset is being degraded.
#
# ONE CHECK OF THREE ABOUT THE DROP, which is why they are three. "Dropping it
# posts a block for that task" passes — the POST goes with the right taskId —
# and "with a start time worked out from where it landed" passes too, because
# the time is still derived from the drop. Only the quarter-hour check fails.
# Three assertions about one request, each about a different property of it.
#
# Reddens: planner-grid: "rounded to the quarter hour, not to pointer precision"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = """    const hoursIn = offsetY / hourPx + FIRST_HOUR
    const quarter = Math.round(hoursIn * 4) / 4
    const clamped = Math.min(Math.max(quarter, FIRST_HOUR), LAST_HOUR)
    const out = new Date(day)
    out.setHours(Math.floor(clamped), Math.round((clamped % 1) * 60), 0, 0)
"""
b = """    const hoursIn = offsetY / hourPx + FIRST_HOUR
    const clamped = Math.min(Math.max(hoursIn, FIRST_HOUR), LAST_HOUR)
    const out = new Date(day)
    out.setHours(Math.floor(clamped), Math.round((clamped % 1) * 60), 0, 0)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: a dropped block keeps pointer precision.')
