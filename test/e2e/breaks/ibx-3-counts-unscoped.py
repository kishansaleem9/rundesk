# THE TAB COUNTS AS THEY WERE: every workspace counted in each.
# Reddens: inbox-scope: "and the counts are each workspace’s own: 60 and 4, all unread"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '      .where(and(eq(notifications.userId, userId), this.scopeCondition(scope)))\n'
b = '      .where(eq(notifications.userId, userId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-3-counts-unscoped: applied")
