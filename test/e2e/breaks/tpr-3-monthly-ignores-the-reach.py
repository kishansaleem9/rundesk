# THE MONTHLY ROLLUP ASKS NO REACH: the manager is shown the far member’s month.
# Reddens: time-page-reach: "so does the monthly rollup: the near member’s two hours, and no row for the far member"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .where(and(eq(workspaceMembers.workspaceId, workspaceId), where))\n      .groupBy(users.id, users.displayName, monthExpr)'
b = '      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(spaces.workspaceId, workspaceId), where && undefined))\n      .groupBy(users.id, users.displayName, monthExpr)'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tpr-3-monthly-ignores-the-reach: the monthly rollup reads everyone')
