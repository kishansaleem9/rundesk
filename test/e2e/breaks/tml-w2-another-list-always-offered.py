# ADD TO › ANOTHER LIST IS OFFERED WHATEVER THE SERVER SAYS.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "it is off until an owner or admin turns it on: the task’s lists say so, adding is refused in words (403) and nothing is kept, and the menu’s Add to › Another List is drawn greyed, saying why"
#
# The menu entry is never greyed.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                            disabled={!taskListsQuery.data?.canChange}\n',
     '                            disabled={false}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-w2-another-list-always-offered: ADD TO › ANOTHER LIST IS OFFERED WHATEVER THE SERVER SAYS.')
