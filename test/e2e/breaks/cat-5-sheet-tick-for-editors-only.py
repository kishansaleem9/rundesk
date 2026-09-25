# THE SHEET OFFERS THE TICK TO EDITORS ALONE, as it did.
# Reddens: checklist-assignee-ticks: "the sheet offers a commenter the tick on their own item, and it saves — and leaves the admin’s item, deleting and renaming as they were, not pressed"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '                      disabled={!(caps.edit || (caps.comment && !!me && item.assigneeId === me))}\n'
b = '                      disabled={!caps.edit}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cat-5-sheet-tick-for-editors-only: applied')
