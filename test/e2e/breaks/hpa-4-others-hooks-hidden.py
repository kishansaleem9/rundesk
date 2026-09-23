# SOMEBODY ELSE'S HOOK IS NOT LISTED AT ALL — "none" for a list that has one.
# Reddens: hook-portal-access: "a member and a guest see the admin’s hook listed — by name, with no token"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '    return rows.map(({ token, ...hook }) => {\n'
b = '    return rows.filter((r) => manages || r.createdById === viewer.id).map(({ token, ...hook }) => {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-4-others-hooks-hidden: applied")
