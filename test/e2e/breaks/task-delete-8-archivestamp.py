# Check 8 — Archive stamps archived_at. Stop stamping it, so archiving leaves
# no record of when and the two states become tellable apart only by luck.
#
# IT NAMED A CHECK THAT PASSES.
# Its claim did not appear in the suite verbatim at all — it was matched by the
# five-word fragment fallback, which is right for "is this sentence here" and
# wrong for "did this check fail". The sentence it reddens names both columns,
# which is the point: archive and delete are two stamps and a row that carries
# the wrong one is in the Trash for everybody who reads it.
#
# Reddens: task-delete: "Archive stamps archived_at and leaves deleted_at empty"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "      .set({ isArchived: true, archivedById: actorId ?? null, updatedAt: new Date() })")
)
print('BROKE check 8: deleteTask (archive) no longer stamps archived_at')
