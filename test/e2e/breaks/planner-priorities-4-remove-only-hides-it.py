# The ✕ stops calling `remove` and the row stays on the server.
#
# The suite's failure message for this check is already the description: "the ✕
# removed the row from the screen and left it on the server." Here it does not
# even do that — the row comes straight back on the next refetch — which is the
# more honest failure of the two and still reads, in the moment, like a control
# that did not take.
#
# ONE CHECK, THE LAST ONE. The add still works, the tick still works, the
# person panel still agrees, and the second priority is still created. The four
# controls in this rail were added together and each has to be provable
# separately, or a patch that broke one would be indistinguishable from a patch
# that broke the section.
#
# Reddens: planner-priorities: "and removing it really removes it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "                    onClick={() => priorityActions.remove.mutate(p.id)}"
b = "                    onClick={() => {}}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the rail\'s remove control no longer removes anything.')
