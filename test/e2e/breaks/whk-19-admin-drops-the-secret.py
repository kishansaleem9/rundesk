# THE ADMIN PAGE THROWS AWAY THE ONE ANSWER THAT CARRIES THE SECRET, as it did.
# Reddens: webhook-access: "made there, the secret shown is the one stored"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-webhooks-page.tsx'
a = '      setMadeSecret(made?.secret ? { name: made.name, secret: made.secret } : null)\n      await qc'
b = '      setMadeSecret(null)\n      await qc'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-19-admin-drops-the-secret: applied")
