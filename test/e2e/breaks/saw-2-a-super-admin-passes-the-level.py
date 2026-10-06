# A SUPER_ADMIN IS LET PAST THE SPACE'S LEVEL AS WELL AS THE READ RULE: in a view-only space, a super_admin who
# is a plain member changes what its members may only view.
# Reddens: super-admin-task-writes: "the space’s level is still asked of a super_admin who is a plain member: in a view-only space they open the task and are refused its change, 403 saying why, the title kept"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n'
b = "  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n  if (account?.role === 'super_admin') return ctx\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('saw-2-a-super-admin-passes-the-level: a super_admin skips the space’s level')
