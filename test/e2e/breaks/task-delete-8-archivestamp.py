# Check 8 — Archive stamps archived_at. Stop stamping it, so archiving leaves
# no record of when and the two states become tellable apart only by luck.
#
# Reddens: task-delete: "an archived task is NOT in the Trash — it is kept, not counting down"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "      .set({ isArchived: true, archivedById: actorId ?? null, updatedAt: new Date() })")
)
print('BROKE check 8: deleteTask (archive) no longer stamps archived_at')
