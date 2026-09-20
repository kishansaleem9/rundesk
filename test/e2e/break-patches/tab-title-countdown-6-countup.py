# Check 6 — it ticks, but the wrong way.
#
# Count the time ELAPSED since the block started instead of the time left in
# it. The title still updates every second, still has the frame's "Xm Ys"
# shape, still names the block, and still gets handed back at the end — checks
# 3, 4, 5, 7 and 10 all stay green. The only thing wrong is the direction, and
# "· 0m 12s left" going UP is the kind of thing a person reads three times
# before believing.
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = "            remaining: formatRemaining(new Date(running.endsAt).getTime() - now),\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    # BROKEN: elapsed, not remaining
    s.replace(a, "            remaining: formatRemaining(now - new Date(running.startsAt).getTime()),\n")
)
print('BROKE check 6: the countdown counts up')
