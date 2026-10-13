# EVERY MAILBOX IS LINKED AS REQUIRING SSL, WHATEVER WAS CHOSEN.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "a mailbox linked without SSL is signed in to in the clear, as its linker chose; one that requires it never sends its password in the clear (read from the server’s sign-ins)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return { address, password, imapHost, imapPort, smtpHost, smtpPort, useSsl: input.useSsl }\n',
     '  return { address, password, imapHost, imapPort, smtpHost, smtpPort, useSsl: true }\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-15-ssl-always: EVERY MAILBOX IS LINKED AS REQUIRING SSL, WHATEVER WAS CHOSEN.')
