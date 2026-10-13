# EVERY COLUMN SEALS UNDER ONE NAME: A VALUE MOVED TO ANOTHER COLUMN OPENS THERE.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: unit: apps/api/src/common/security/secrets-at-rest.test.ts "a value kept before the key, or written without one, is read as it is; one sealed for another column reads as empty"
import io
p = '/home/user/rundesk/packages/db/src/schema/sealed-text.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    toDriver: (value) => (secretBoxKey() ? seal(value, context) : value),\n',
     "    toDriver: (value) => (secretBoxKey() ? seal(value, 'sealed') : value),\n"),
    ('        return open(value, context)\n',
     "        return open(value, 'sealed')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-u2-sealed-for-no-column: EVERY COLUMN SEALS UNDER ONE NAME: A VALUE MOVED TO ANOTHER COLUMN OPENS THERE.')
