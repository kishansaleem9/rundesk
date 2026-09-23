# THE LIST CARRIES EVERY HOOK'S TOKEN TO EVERYONE WHO CAN OPEN IT, as it did.
# Reddens: hook-portal-access: "a member and a guest see the admin’s hook listed — by name, with no token"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '      return { ...hook, canManage, ...(canManage ? { token } : {}) }\n'
b = '      return { ...hook, canManage, token }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-3-tokens-to-everyone: applied")
