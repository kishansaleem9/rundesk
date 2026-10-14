# A 429 IS AN ERROR AT ONCE, NOT WAITED OUT.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "waits out a 429 as Retry-After says, and reads a 401 as the grant refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-http.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (res.status === 429 && attempt < 5) {\n',
     '      if (res.status === 429 && attempt < 0) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u9-one-try: A 429 IS AN ERROR AT ONCE, NOT WAITED OUT.')
