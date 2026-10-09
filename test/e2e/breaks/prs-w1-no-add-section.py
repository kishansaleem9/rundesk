# THE SIDEBAR PAGE HAS NO “+ ADD A NEW SECTION”.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "“+ Add a new section” makes a section with its name and emoji: the Sidebar page lists it, the rail draws it at its foot under that heading, and the server holds it"
#   or "its + finds a task by its title and puts it in: the rail lists it under the section, and the server holds it there"
#   or "a task is in one of a person’s sections at a time: put in another, it moves — the first says it is empty, the second lists it"
#   or "dragged above Priorities on the Sidebar page, it is first in the rail, and the order is kept"
#   or "an order saved from the other workspace keeps this one’s section where it stood, and each rail draws only its own"
#   or "a task goes in only when its putter may open it — a private list’s is refused saying why — and only from this workspace"
#   or "a name past 60 characters, a blank one, and words for an emoji are refused, and nothing is made"
#   or "a task in one’s own section is picked up and dropped on the grid as Backlog’s are, and blocks time for it"
#
# Re-aimed 8 October: the last 7 of these are knock-ons of the same edit, measured on lane 7 — checks that stand on what the first ones lost.
# Everything after the first section is made fails with it: each check needs a section the page made.
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                    data-testid="planner-rail-add-section"\n',
     '                    data-testid="planner-rail-add-section-gone" hidden\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-w1-no-add-section: no add section')
