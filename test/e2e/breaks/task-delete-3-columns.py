# Check 3 — Delete stamps the DELETE columns and leaves the ARCHIVE ones empty.
# Make it stamp archived_at too, so one deletion shows up as both states.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      .set({ isArchived: true, deletedAt: now, deletedById: actorId ?? null, updatedAt: now })"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    "      .set({ isArchived: true, archivedAt: now, deletedAt: now, deletedById: actorId ?? null, updatedAt: now })",
))
print('BROKE check 3: binTask now stamps archived_at as well as deleted_at')
