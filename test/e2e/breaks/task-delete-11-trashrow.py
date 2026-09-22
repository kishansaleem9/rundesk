# Check 11 — the Trash tab draws an identifiable row for the deleted task.
# Drop the id off the row, so the surface can only be asserted on by counting.
#
# Reddens: task-delete: "the Trash tab draws a row for the deleted task, tagged with its type and id"
import io
p = '/home/user/rundesk/apps/web/src/components/trash-tab.tsx'
s = io.open(p, encoding='utf-8').read()
a = "                    data-trash-id={item.id}\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('BROKE check 11: Trash rows no longer carry the id of the thing they are about')
