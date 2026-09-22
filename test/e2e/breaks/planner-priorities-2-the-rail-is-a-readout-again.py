# The "+ Add priority" form clears its input and writes nothing.
#
# The rail goes back to what §V2-S14b found: a heading, an empty state reading
# "Prioritize a task to see it appear here", and nothing you can press that
# does anything. The instruction is still printed on a surface that cannot
# follow it — except now there is a box to type into, which is worse, because
# the typing disappears and reads as success.
#
# IT STOPS THE RUN. The server list stays empty, so `stored.find(…)` is
# undefined and the tick check dereferences `row.id`. That is not a weakness:
# five of the nine checks below this one act on a priority that was supposed to
# exist, and a suite cannot evaluate "ticking it marks it done" when there is
# no it. The run reports how far it reached.
#
# The `add` mutation itself is left alone, because the defect being modelled is
# the CONTROL not being wired — the mutations existed all along, on the person
# panel, which is the whole reason this item is about a rail rather than about
# an API.
#
# Reddens: planner-priorities: "the priority exists on the server, not just on screen"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "              priorityActions.add.mutate(title, { onSuccess: () => setPriorityDraft('') })"
b = "              setPriorityDraft('')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the rail\'s Add control clears the box and writes nothing.')
