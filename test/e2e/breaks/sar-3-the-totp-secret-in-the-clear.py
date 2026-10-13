# THE TOTP SECRET IS KEPT AS ITS BASE32 AGAIN.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: secrets-at-rest: "a TOTP secret is kept sealed, not as the base32 its column said was encrypted, and a code from the secret shown at setup still verifies (read by SQL)"
import io
p = '/home/user/rundesk/packages/db/src/schema/security.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  secret:      sealedText('secret', 'user_totp_secrets.secret').notNull(),\n",
     "  secret:      text('secret').notNull(),\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-3-the-totp-secret-in-the-clear: THE TOTP SECRET IS KEPT AS ITS BASE32 AGAIN.')
