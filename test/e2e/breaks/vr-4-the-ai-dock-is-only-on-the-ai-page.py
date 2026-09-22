# The AI dock handle renders only while the dock is already open, so the top bar
# can close it and never open it.
#
# The suite's check is "the AI dock is on screen outside the AI page", and it
# navigates to `/app/<ws>` — the workspace home — before looking. That is the
# whole claim: an assistant you have to navigate to is one you consult instead
# of one you ask, and the AI page is the single screen where you already know
# you want it.
#
# The inversion is a plausible one rather than a deleted line. This component
# already returns null for a workspace with AI switched off — "a workspace that
# switched AI off should not be offered the handle" — so a second early return
# keyed on `open` reads as the same kind of tidying, and it produces a control
# that looks correct in every state you can reach with it open.
#
# PREDICTED THREE. IT REDDENED FOUR AND TRUNCATED THE RUN, AND NOW IT REDDENS
# NINE — and that arc is the whole reason this patch was worth running.
#
# The prediction read the G13-10 chain's no-toggle branch, which reported three
# checks, and missed A6.4 above it: `the AI dock is on screen outside the AI
# page` looks for the same handle from the workspace home, so removing it fails
# there too. Four.
#
# The run said `84 passed, 4 failed` under `✗ 88 of 92 checks ran`. The chain's
# three branches reported three, four and seven checks, so the branch this
# patch takes made the run FOUR SHORT — and the suite's exact-count guard then
# declared the RUN broken rather than the product, with the four FAIL lines
# naming the missing dock sitting underneath that headline. A person reading it
# reaches for the harness. One of the eight sentences, "the AI dock can be
# opened", existed ONLY on the branch where there was no dock to open, so the
# path that clicked it never asserted it was there.
#
# The chain reports eight on every path now, one of them new, and 92 → 93. This
# patch reddens all eight plus A6.4 — nine — and the run reaches its own totals:
# `84 passed, 9 failed`, 93 of 93. That is the right shape for a missing entry
# point: one failure that is the cause and the rest saying plainly they could
# not be evaluated, none of them silently absent.
#
# Reddens: video-regression: "the AI dock can be opened" and
#   "the AI dock is on screen outside the AI page", plus the six that report
#   they could not be evaluated
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """  // A workspace that switched AI off should not be offered the handle.
  if (!featureEnabled(FLAGS.AI)) return null
"""
b = """  // A workspace that switched AI off should not be offered the handle.
  if (!featureEnabled(FLAGS.AI)) return null
  // Nor should one where the dock is not already showing.
  if (!open) return null
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: the AI dock handle only appears once the dock is open.')
