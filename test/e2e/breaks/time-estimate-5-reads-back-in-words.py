# An hours-only estimate reads back as "12 hours" instead of `12h`.
#
# Frame `01:45` shows the field holding **`12h`**, and that is the whole of the
# spec here: `formatEstimate`'s comment says "Frame `01:45` shows `12h` where
# the old field showed `12`." This patch makes the field agree with the
# SUGGESTION ROW instead of with the frame — "make the box read like the row it
# came from" is a tidy-sounding unification, and it is wrong about which of the
# two the frame pinned.
#
# It still round-trips, which is why it survives casual use: `parseEstimate('12
# hours')` is twelve hours, so nothing breaks, nothing errors, and the value
# stays correct. Only the words change, and only for an estimate with no
# minutes in it.
#
# EXACTLY ONE CHECK. The hours-and-minutes branch is untouched, so "reads back
# as 1h 30m" and the `2h 15m` put-back both stay green. The suggestion row also
# stays, because `formatEstimate(43200)` is still not equal to the `12` in the
# box — a patch that made those equal would suppress the row and stop the run
# three checks in, which is why this one changes the wording rather than the
# shape.
#
# ALSO CAUGHT BY `estimate.test.ts`, 14 pass / 1 fail — `formatEstimate(12 * 3600)`
# is asserted to equal `12h`, citing the frame. Measured, not assumed: the first
# attempt at this measurement said the unit test passed, and it was wrong. See
# the process doc on running a verification loop against a working tree a
# background job is patching.
#
# Reddens: time-estimate: "the stored estimate reads back with its unit"
import io
p = '/home/user/rundesk/apps/web/src/lib/estimate.ts'
a = "  if (h) return `${h}h`"
b = "  if (h) return `${h} hours`"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('estimate.ts: an hours-only estimate reads back as "12 hours" rather than 12h.')
