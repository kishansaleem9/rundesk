# THE PEOPLE WHO MANAGE THE WORKSPACE SEE ONLY THEIR OWN HOOKS' ADDRESSES.
# Reddens: hook-portal-access: "while the admin reads every hook’s address, and the member reads the one they made"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = "    const manages = viewer.role === 'super_admin' || isManagerRole(ctx?.role)\n"
b = '    const manages = false && isManagerRole(ctx?.role)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-5-admins-see-no-tokens: applied")
