# Check 12 — restoring from the Trash clears BOTH flags. Clear only deleted_at,
# which takes the task out of the Trash and leaves it invisible everywhere —
# worse than the state it was in.
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "        .set({ ...clear, deletedAt: null, deletedById: null })"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "        .set({ deletedAt: null, deletedById: null, updatedAt: new Date() })"))
print('BROKE check 12: trash restore leaves is_archived true, so the task comes back invisible')
