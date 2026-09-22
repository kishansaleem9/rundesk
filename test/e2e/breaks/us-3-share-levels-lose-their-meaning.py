# The share panel lists the four levels and stops explaining what they mean.
#
# All four labels stay — View, Comment, Edit, Full edit — in the same order,
# with the same values, and the picker works. Only the sentence after the dash
# goes, and the `hintKey` stays on every row in `LEVELS`, so the file still
# looks like it explains itself.
#
# Four words is not a permission model. "Edit" and "Full edit" differ by
# whether you can DELETE the thing — which is what
# `share.levelFullHint` says and what nothing else on the screen does — so the
# person granting access is choosing between two options whose difference is
# invisible at the moment they choose. The one that can delete looks like the
# generous version of the one that cannot.
#
# PREDICTED ONE AND IT RAN GREEN, WHICH FOUND THE CHECK SCANNING THE WRONG
# THING. `each level carries a one-line meaning` was
# `/only|explan|can |may /i.test(t)` over the WHOLE dialog text — and a dialog
# that also holds a title, a member list and a Copy link button will match one
# of four loose substrings whatever the levels say. It could not tell a
# per-level explanation from any sentence anywhere on screen.
#
# The levels render as `<label> — <hint>`, so the claim is that each label is
# FOLLOWED by an explanation. Read per level now, off the level's own row, with
# the bare ones named in the failure — which is the difference between "add
# explanations" and "add the two you dropped". Verified both ways against the
# real panel text before re-running: four bare with the hints gone, none with
# them.
#
# The four `the <level> level is offered with an explanation` checks still pass,
# because the words are all there; that is what makes this the one check in the
# section that can see the difference.
#
# MEASURED AGAINST THE REWRITE: `106 passed, 1 failed` — the one it predicted,
# and the first time this patch has been evidence of anything. The rewrite also
# failed its own baseline first, because the level is called "View only" and the
# check looked for `View` followed by a dash; `wt-break.sh` refused the whole
# set on the red baseline rather than reporting four misread results.
#
# Reddens: ui-sweep: "each level carries a one-line meaning"
import io
p = '/home/user/rundesk/apps/web/src/components/share-panel.tsx'
a = """              <span className="font-medium text-foreground">{t(l.labelKey)}</span> — {t(l.hintKey)}
"""
b = """              <span className="font-medium text-foreground">{t(l.labelKey)}</span>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('share-panel.tsx: the levels are listed without their one-line meanings.')
