# EVERY SEALED COLUMN KEEPS WHAT IT IS GIVEN, IN THE CLEAR.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: secrets-at-rest: "a Gmail linked through Google’s consent keeps both its tokens sealed — neither holds the token — and its email is sent with the token they open to (read by SQL)"
#   or "a TOTP secret is kept sealed, not as the base32 its column said was encrypted, and a code from the secret shown at setup still verifies (read by SQL)"
#   or "a webhook’s signing secret is shown once, kept sealed, and listed after only as there being one (read by SQL)"
import io
p = '/home/user/rundesk/packages/db/src/schema/sealed-text.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    toDriver: (value) => (secretBoxKey() ? seal(value, context) : value),\n',
     "    toDriver: (value) => (secretBoxKey() && context === 'never' ? seal(value, context) : value),\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-1-kept-in-the-clear: EVERY SEALED COLUMN KEEPS WHAT IT IS GIVEN, IN THE CLEAR.')
