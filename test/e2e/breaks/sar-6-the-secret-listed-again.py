# A WEBHOOK’S SECRET IS LISTED WITH IT AFTER IT WAS MADE.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: secrets-at-rest: "a webhook’s signing secret is shown once, kept sealed, and listed after only as there being one (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return { ...rest, hasSecret: Boolean(secret) }\n',
     '  return { ...rest, secret, hasSecret: Boolean(secret) } as never\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-6-the-secret-listed-again: A WEBHOOK’S SECRET IS LISTED WITH IT AFTER IT WAS MADE.')
