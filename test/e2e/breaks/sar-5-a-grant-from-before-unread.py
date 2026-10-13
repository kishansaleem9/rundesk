# A VALUE KEPT BEFORE THE KEY READS AS EMPTY.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: secrets-at-rest: "a grant kept in the clear before the key was set is still read: its email goes with the token it holds"
import io
p = '/home/user/rundesk/packages/db/src/schema/sealed-text.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!isSealed(value)) return value\n',
     "      if (!isSealed(value)) return ''\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-5-a-grant-from-before-unread: A VALUE KEPT BEFORE THE KEY READS AS EMPTY.')
