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
# REDDENS THREE, IN A CHAIN THE SUITE WRITES DOWN ITSELF: with no toggle to
# click it reports "the AI dock can be opened" as failed and then "so the trace
# was never checked" and "and neither was the answer" as failures too, rather
# than passing them vacuously or throwing. That is the right shape for a
# missing entry point — one failure that is the cause and two that say plainly
# they could not be evaluated.
#
# Reddens: video-regression: "the AI dock can be opened"
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
