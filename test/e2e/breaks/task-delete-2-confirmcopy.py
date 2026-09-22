# Check 2 — the confirmation names the Trash and the 30-day window. Reword it
# to the vague sentence a delete usually ships with.
#
# Reddens: task-delete: "the confirmation names the Trash and the 30-day window"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
a = "  'taskDetail.confirmDeleteTask': 'Delete this task? It moves to the workspace Trash, where you can restore it for 30 days before it is deleted permanently.',"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "  'taskDetail.confirmDeleteTask': 'Delete this task?',")
)
print('BROKE check 2: the delete confirmation no longer mentions the Trash or the 30 days')
