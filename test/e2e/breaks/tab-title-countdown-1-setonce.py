# Check 5 (and, as collateral, 6 and 7) — THE PATCH THIS ROW EXISTS FOR.
#
# Set the title ONCE, from whatever the first render happened to know, and
# never look at the clock again. The tab still reads
# "Work on Focus countdown … · 0m 42s left" — it just says it forever, which is
# how a frozen countdown passes for a live one in every screenshot ever taken
# of it.
#
# Expect check 5 ("the countdown MOVES while you watch it") to go red. 6 and 7
# follow it down, because the same ticker is what notices the block ending.
#
# NOTE: re-anchored after the module grew a shared one-second ticker
# (`subscribeSecond`) for the header pill. The subscription is what is removed;
# the cleanup still calls `stop()`, so check 10 is untouched.
#
# Reddens: tab-title-countdown: "the countdown MOVES while you watch it"
import io, sys
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = "    paint()\n    const stop = subscribeSecond(paint)\n"
if s.count(a) != 1:
    sys.exit('anchor %d times' % s.count(a))
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "    paint()\n    const stop = () => {} // BROKEN: painted once, never again\n")
)
print('BROKE check 5: the title is set once at mount and never updated again')
