# THE RAIL DRAWS NONE OF THE PERSON'S OWN SECTIONS.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "“+ Add a new section” makes a section with its name and emoji: the Sidebar page lists it, the rail draws it at its foot under that heading, and the server holds it"
#   or "its + finds a task by its title and puts it in: the rail lists it under the section, and the server holds it there"
#   or "a task is in one of a person’s sections at a time: put in another, it moves — the first says it is empty, the second lists it"
#   or "a task in one’s own section is picked up and dropped on the grid as Backlog’s are, and blocks time for it"
#   or "dragged above Priorities on the Sidebar page, it is first in the rail, and the order is kept"
#   or "an order saved from the other workspace keeps this one’s section where it stood, and each rail draws only its own"
#
# Re-aimed 8 October: the last 2 of these are knock-ons of the same edit, measured on lane 7 — checks that stand on what the first ones lost.
# Every check that reads the rail for a section of one's own fails with it.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {sectionIdOf(key) && (() => {\n',
     '        {sectionIdOf(key) && key.length < 0 && (() => { // BROKEN: drawn nowhere\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-w3-the-rail-draws-no-own-section: the rail draws no own section')
