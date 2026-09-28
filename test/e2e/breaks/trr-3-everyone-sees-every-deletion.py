# EVERYONE'S TRASH LISTS EVERY DELETION: the list is not narrowed to the caller's own.
# Reddens: trash-rules: "a member’s Trash lists what they deleted and nothing anyone else did"
#   or "a manager’s Trash is a member’s: their own deletions only, and no one else’s restored, purged or emptied (403 each)"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const restrictTo = isAdmin ? query.deletedByIds ?? null : [actor.id]\n"
b = "    const restrictTo = query.deletedByIds ?? null\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-3-everyone-sees-every-deletion: the list is not narrowed')
