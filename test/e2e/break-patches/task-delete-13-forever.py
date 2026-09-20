# Check 13 — "Delete forever" removes the row itself. Make it a soft touch
# instead: the Trash empties, the row survives, and nothing says so.
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      await this.db.delete(tasks).where(eq(tasks.id, id))"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "      await this.db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, id))")
)
print('BROKE check 13: Delete forever no longer removes the task row')
