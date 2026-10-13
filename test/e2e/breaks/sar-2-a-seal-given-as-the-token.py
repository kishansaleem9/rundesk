# A SEALED VALUE IS GIVEN TO THE CODE AS IT IS KEPT: THE PROVIDER IS SENT THE SEAL.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: secrets-at-rest: "a Gmail linked through Google’s consent keeps both its tokens sealed — neither holds the token — and its email is sent with the token they open to (read by SQL)"
#   or "a TOTP secret is kept sealed, not as the base32 its column said was encrypted, and a code from the secret shown at setup still verifies (read by SQL)"
import io
p = '/home/user/rundesk/packages/db/src/schema/sealed-text.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!isSealed(value)) return value\n',
     '      if (!isSealed(value) || context.length > 0) return value\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-2-a-seal-given-as-the-token: A SEALED VALUE IS GIVEN TO THE CODE AS IT IS KEPT: THE PROVIDER IS SENT THE SEAL.')
