# A HOOK'S OWN CREATOR IS NOT SHOWN ITS ADDRESS.
# Reddens: hook-portal-access: "while the admin reads every hook’s address, and the member reads the one they made"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '      const canManage = manages || hook.createdById === viewer.id\n'
b = '      const canManage = manages\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-6-creators-see-no-token: applied")
