# A TASK IN ONE'S OWN SECTION IS NOT PICKED UP.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "a task in one’s own section is picked up and dropped on the grid as Backlog’s are, and blocks time for it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                e.preventDefault()\n                setDragging({ taskId: task.id, title: task.title })\n                setGhost({ x: e.clientX, y: e.clientY })\n              }}\n            />\n',
     '                e.preventDefault()\n                void task // BROKEN: nothing picked up\n              }}\n            />\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-w6-own-section-tasks-do-not-drag: own section tasks do not drag')
