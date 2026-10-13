# A WEBHOOK’S SIGNING SECRET IS KEPT IN THE CLEAR AGAIN.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: secrets-at-rest: "a webhook’s signing secret is shown once, kept sealed, and listed after only as there being one (read by SQL)"
import io
p = '/home/user/rundesk/packages/db/src/schema/webhooks.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  secret:      sealedText('secret', 'webhooks.secret'),        // HMAC signing secret, sealed at rest\n",
     "  secret:      text('secret'),        // HMAC signing secret\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-4-the-webhook-secret-in-the-clear: A WEBHOOK’S SIGNING SECRET IS KEPT IN THE CLEAR AGAIN.')
