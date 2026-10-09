# A TASK PICKED UNDER THE SECTION'S + IS NOT PUT IN.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "its + finds a task by its title and puts it in: the rail lists it under the section, and the server holds it there"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-own-section.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                  onClick={() => add.mutate(task.id)}\n',
     '                  onClick={() => setQuery(task.title)} // BROKEN: nothing put in\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-w4-the-picker-puts-nothing-in: the picker puts nothing in')
