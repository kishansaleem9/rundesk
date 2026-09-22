# The header pill removed entirely — the state this row was opened over, where
# `use-focus-tab-title.ts` computed the countdown and the only consumer in the
# codebase wrote `document.title`. The ledger said "in the header" and the
# header had nothing in it.
# ELEVEN OF FIFTEEN, MEASURED — and the header used to say "the whole run".
# That was not a prediction, it was a description of the harness dying: an
# unqualified `pill().click()` spent thirty seconds on a header with no pill,
# threw, and the run ended at twelve of fifteen with three checks never
# reported. `focus-pill` bounds that click now and reports the short block's
# ending as a failure with its reason, so the patch reddens checks instead of a
# run: `4 passed, 11 failed`, and four plus eleven is the suite's own total.
#
# The four that PASS are the four that should. Two are the section with nothing
# running — no request for a block that is not there, and no pill to draw — and
# they are the checks that would catch a pill drawn when it should not be. The
# third is the router genuinely leaving the planner for the List page, which is
# the fixture for the check after it rather than a fact about the pill. The
# fourth is the reload-loop bound, which holds because nothing is reloading.
#
# Reddens: focus-pill: "the pill names the block" and "and the pill is still
#   there — it belongs to the app, not to the planner"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """  const running = useRunningFocusBlock(workspaceId)
  if (!running) return null
"""
b = """  const running = useRunningFocusBlock(workspaceId)
  if (running || !running) return null
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: FocusBlockPill renders nothing at all — the header countdown is gone again.')
