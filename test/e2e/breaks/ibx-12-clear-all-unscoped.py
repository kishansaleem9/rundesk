# CLEAR ALL AS IT WAS: filtered by type and by nothing else.
# Reddens: inbox-scope: "clearing B clears B’s three and the account-level row, and not one of A’s own"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '          this.scopeCondition(opts),\n        ),\n      )\n      .returning({ id: notifications.id })\n'
b = '          opts.types?.length ? inArray(notifications.type, opts.types as never) : undefined,\n        ),\n      )\n      .returning({ id: notifications.id })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-12-clear-all-unscoped: applied")
