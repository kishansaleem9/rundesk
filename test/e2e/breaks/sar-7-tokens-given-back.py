# THE EMAIL SETTINGS GIVE BACK EACH MAILBOX’S TOKEN.
# (`found-13-oct/provider-grants-kept-in-the-clear`)
# Reddens: secrets-at-rest: "what the Email settings give back holds neither a token nor a sealed one"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        senders: mine || admin ? its : null,\n',
     '        senders: mine || admin ? its : null,\n        accessToken: a.accessToken,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sar-7-tokens-given-back: THE EMAIL SETTINGS GIVE BACK EACH MAILBOX’S TOKEN.')
