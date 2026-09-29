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
# PREDICTED TWO, AND IT IS TWO SINCE 29 SEPTEMBER. The pair is complementary —
# the boundary must appear AND the recovery must stand down — and the reload
# check used to be `reloads <= 3`, which this patch left green at
# `no reload loop (2 document loads)`: the chunk is only asked for on a click,
# the suite clicks twice, and without the cooldown each click reloads once. Two
# is under three, so the ceiling could not see a missing cooldown in the window
# the suite waits (`commit-log/log-641be6c-1`).
#
# The check asserts the cooldown itself now: exactly ONE recovery reload, the
# second failure inside the cooldown standing down to the boundary instead. On
# the builds this was measured against (outside the repository, the suite's own
# two releases with this replacement made in release A's copy), the run reads
# `FAIL … (2 document loads) — the second failure, inside the cooldown,
# reloaded again instead of standing down` beside the boundary check, 25 passed
# and 2 failed; unpatched it is 27 of 27 with one document load.
#
# The `force` path is untouched, so the Try again button still works — which is
# what keeps this from being the obvious deletion. Only the automatic recovery
# loses its bound.
#
# Reddens: stale-chunk-recovery: "the error boundary is shown once reloading has not helped" and
#   "no reload loop: one recovery reload, and no second inside the cooldown"
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
