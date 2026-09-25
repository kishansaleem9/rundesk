# THE SHEET OFFERS A COMMENTER THE CHECKLIST'S EDITING CONTROLS.
# Reddens: checklist-assignee-ticks: "the sheet offers a commenter the tick on their own item, and it saves — and leaves the admin’s item, deleting and renaming as they were, not pressed"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '    <fieldset disabled={!caps.edit} className="contents">\n'
b = '    <fieldset disabled={false && !caps.edit} className="contents">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cat-7-sheet-editors-controls-free: applied')
