# The rail's checkbox stops calling `setDone`.
#
# A picture of a checkbox — the suite's own failure message for this check, and
# the thing the rail was before §V2-S14b: "The rail could show a priority and
# not let you make one, finish one or drop one; to tick something off you had
# to leave the Planner and open the person panel."
#
# `onClick` becomes a no-op rather than being removed, so the element is still
# a button, still enabled, still hoverable, still has its title and aria-label
# promising "Mark done". Everything an accessibility tree or a screenshot
# reports about it is unchanged.
#
# REDDENS TWO, AND THE SECOND IS THE CONSEQUENCE OF THE FIRST: the server never
# marks it done, so the rail never drops it from the open list. Both are about
# this one control. Adding still works, the person panel still agrees, and the
# remove check below runs on its own second priority and stays green — which is
# what keeps the failure pointing at the tick.
#
# Reddens: planner-priorities: "ticking it marks it done on the server"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "                    onClick={() => priorityActions.setDone.mutate({ id: p.id, done: !p.doneAt })}"
b = "                    onClick={() => {}}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the rail\'s tick is a picture of a checkbox again.')
