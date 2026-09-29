# THE SHEET SAYS NOTHING OF AN ARCHIVED TASK AGAIN.
# Reddens: unarchive-in-place: "the task sheet says the task is archived and offers Unarchive, which restores it there, and the notice goes"
#   or "in a view-only space the sheet says the task is archived and offers no Unarchive"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '            {detailQuery.data.isArchived && !detailQuery.data.deletedAt && (\n'
b = '            {Boolean(0) && detailQuery.data.isArchived && !detailQuery.data.deletedAt && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uip-4-no-archived-notice: no archived notice')
