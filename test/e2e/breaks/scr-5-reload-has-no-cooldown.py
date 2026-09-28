# The recovery reload stops asking whether reloading has already been tried.
#
# `canReloadForStaleChunks` stays exported, stays pure, stays unit tested and
# keeps its whole comment — the guard is simply no longer CONSULTED by the one
# caller whose behaviour it exists to bound. That is the mirror of the facade: a
# value computed correctly and read by nobody, and the hardest kind to see from
# here, because the function it lives in is a line long and reads as a
# simplification. Why refuse to reload? Just reload.
#
# Because a deploy can be broken rather than merely newer. When the chunk is
# gone and STAYS gone, reloading cannot help, and a mechanism that reloads
# anyway turns one dead screen into a tab that reloads for as long as somebody
# watches it — no error, no explanation, no way to read what went wrong. The
# cooldown is what converts "this is not working" into an honest error boundary.
#
# PREDICTED TWO AND IT IS ONE, and the one that stayed green is worth the note.
# The pair is meant to be complementary — the boundary must appear AND the
# reload count must stay bounded — and the run reports
# `PASS no reload loop (2 document loads)` beside the boundary check failing.
#
# Two is under the check's ceiling of three, so the loop check cannot see a
# missing cooldown inside the window the suite waits: the suite clicks, waits
# four seconds, clicks again, waits five, and an unbounded reload gets through
# two documents in that time rather than thirty. **The bound is real and the
# check is loose**, which is a fact about the check rather than about the code —
# and the honest place for it is here, where the next person reading this patch
# can see that one of its two checks is not load-bearing. Tightening the ceiling
# would need the suite to wait longer, which costs every run; naming it costs
# nothing.
#
# The `force` path is untouched, so the Try again button still works — which is
# what keeps this from being the obvious deletion. Only the automatic recovery
# loses its bound.
#
# Reddens: stale-chunk-recovery: "the error boundary is shown once reloading has not helped"
#   (`no reload loop (${reloads} document loads)` stays green — see the paragraph above)
import io
p = '/home/user/rundesk/apps/web/src/lib/chunk-reload.ts'
a = """export function reloadForStaleChunks(force = false): boolean {
  if (!force && !canReloadForStaleChunks()) return false
"""
b = """export function reloadForStaleChunks(force = false): boolean {
  void force
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('chunk-reload.ts: the automatic recovery reload has no cooldown.')
