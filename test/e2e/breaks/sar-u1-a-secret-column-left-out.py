# A COLUMN THAT HOLDS A SECRET IS LEFT OUT OF THE SEALED ONES.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: unit: apps/api/src/common/security/secrets-at-rest.test.ts "no column that holds a token or a secret is left out of the sealed ones"
import io
p = '/home/user/rundesk/apps/api/src/common/security/secrets-at-rest.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  { name: 'webhooks', table: webhooks, id: webhooks.id, columns: { secret: webhooks.secret } },\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-u1-a-secret-column-left-out: A COLUMN THAT HOLDS A SECRET IS LEFT OUT OF THE SEALED ONES.')
