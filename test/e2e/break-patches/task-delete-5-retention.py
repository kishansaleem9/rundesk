# Check 5 — the delete response quotes the SAME retention the Trash does.
# Replace the shared constant with a second copy that has drifted.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return { ok: true, deletedAt: now.toISOString(), retentionDays: TRASH_RETENTION_DAYS }"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "    return { ok: true, deletedAt: now.toISOString(), retentionDays: 7 }")
)
print('BROKE check 5: the delete now reports a 7-day retention while the Trash still says 30')
