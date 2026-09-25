# THE CHECKLISTS TAB IS ONE DISABLED FIELDSET FOR A COMMENTER, as it was.
# Reddens: checklist-assignee-ticks: "the sheet offers a commenter the tick on their own item, and it saves — and leaves the admin’s item, deleting and renaming as they were, not pressed"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '                <fieldset disabled={!caps.edit && !caps.comment} className="m-0 min-w-0 border-0 p-0" data-testid="task-checklists-fieldset">'
b = '                <fieldset disabled={!caps.edit} className="m-0 min-w-0 border-0 p-0" data-testid="task-checklists-fieldset">'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cat-8-sheet-fieldset-for-editors: applied')
