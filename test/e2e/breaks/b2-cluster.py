# The three loose in the toolbar again — the state the wrap came from.
#
# IT RAN GREEN, AND `display: contents` IS WHY. The element survives, its testid
# survives, and the three chips are still its DOM CHILDREN — so the check that
# counts them inside `[data-testid="list-view-controls"]` was satisfied, and at
# a 1600px viewport nothing wraps, so the one-row check was satisfied too. Every
# assertion about the cluster held while the cluster had stopped existing.
#
# What `contents` removes is the wrapper's own BOX. `list-view-controls` asserts
# that box contains all three now — true at any width, which is why it is
# asserted directly rather than by narrowing the viewport and hoping the wrap
# lands where the frame would show it. 49 checks → 50.
#
# PREDICTED ONE.
# Reddens: list-view-controls: "and the cluster is a box of its own that holds all three"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a='<div className="flex shrink-0 items-center gap-2" data-testid="list-view-controls">'
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,'<div className="contents" data-testid="list-view-controls">'))
