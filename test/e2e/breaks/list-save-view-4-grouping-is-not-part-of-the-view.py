# The dirty-state fingerprint stops seeing `groupBy`, so changing the grouping
# no longer raises the chip.
#
# `configFingerprint` normalises `hiddenFields` because a Set's iteration order
# carries no meaning; pinning a second field to a constant is the same edit
# with a different justification, and grouping is a plausible thing to decide
# is "a view of the screen, not of the view". It is not: `currentViewConfig`
# carries it, `applyView` restores it, and the server stores it. Under this
# patch it is saved and restored and simply never reported as unsaved — the
# one combination that loses work silently.
#
# IT STOPS THE RUN AT 4 OF 7, AND THAT IS WHAT A MISSING CHIP MEANS. The three
# checks after it all click the chip, and a click on an element that is not
# there is a Playwright timeout rather than a check result. That is not a
# weakness in the suite: the chip's absence is the defect, and three assertions
# about what happens when you press it cannot be evaluated when there is
# nothing to press. The run reports "only 4 of 7 checks ran", which says
# exactly that.
#
# Reddens: list-save-view: "changing the view raises the chip"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "    JSON.stringify({ ...cfg, hiddenFields: [...cfg.hiddenFields].sort() })"
b = "    JSON.stringify({ ...cfg, groupBy: '', hiddenFields: [...cfg.hiddenFields].sort() })"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the grouping no longer counts as an unsaved change.')
