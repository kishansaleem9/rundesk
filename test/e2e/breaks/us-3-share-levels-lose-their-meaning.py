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
# ONE CHECK, AND THE SUITE SPLIT IT OUT FROM THE FOUR LABEL CHECKS FOR THIS
# REASON: each `the <level> level is offered with an explanation` reads the
# panel for that word and passes, because the words are all there. Only `each
# level carries a one-line meaning` looks for the explanation, and it looks for
# it as prose — `/only|explan|can |may /i` — rather than for a testid, because
# what matters is that a sentence is there to read.
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
