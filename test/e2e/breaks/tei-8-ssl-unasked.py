# WHETHER SSL IS REQUIRED IS NOT ASKED: ANYTHING READS AS YES.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the form is refused field by field, in words: the address, the password, each server and port, and whether SSL is required (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (typeof input.useSsl !== 'boolean') throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapSsl)\n  return { address, password, imapHost, imapPort, smtpHost, smtpPort, useSsl: input.useSsl }\n",
     '  return { address, password, imapHost, imapPort, smtpHost, smtpPort, useSsl: input.useSsl !== false }\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-8-ssl-unasked: WHETHER SSL IS REQUIRED IS NOT ASKED: ANYTHING READS AS YES.')
