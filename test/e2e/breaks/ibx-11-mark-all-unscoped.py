# MARK ALL READ AS IT WAS: every workspace read from one workspace's Inbox.
# Reddens: inbox-scope: "marking B all read reads B’s rows and leaves A’s ten unread"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = "          this.viewCondition('inbox', now),\n          this.scopeCondition(scope),\n        ),\n      )\n    return { ok: true }\n"
b = "          this.viewCondition('inbox', now),\n        ),\n      )\n    return { ok: true }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-11-mark-all-unscoped: applied")
