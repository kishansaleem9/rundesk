# THE LIST AS IT WAS: every workspace's rows, whatever workspace asked.
# Reddens: inbox-scope: "A’s list holds A’s fifty-nine and the one account-level row — nothing of B’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '      this.scopeCondition(opts),\n      opts.before ? this.olderThan(opts.before) : undefined,\n'
b = '      opts.types?.length ? inArray(notifications.type, opts.types as never) : undefined,\n      opts.before ? this.olderThan(opts.before) : undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-1-list-unscoped: applied")
