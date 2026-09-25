# SECURITY IS AN ADMIN’S AGAIN: a member granted security.policy.manage is sent away.
# Reddens: settings-tabs-by-key: "a member granted security.policy.manage opens Settings on Security, offered its API keys"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  security: ['security.policy.manage'],\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-10-security-admins-only: Security opens to admins alone')
