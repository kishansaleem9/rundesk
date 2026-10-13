# THE FORM SENDS NO SSL: THE MAILBOX IS LINKED IN THE CLEAR, WHATEVER WAS TICKED.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "From’s Link an email offers Sign in with IMAP; its form links the mailbox, From chooses it at once, and Send sends from it over TLS"
import io
p = '/home/user/rundesk/apps/web/src/components/imap-link-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('smtpHost, smtpPort: Number(smtpPort), useSsl },',
     'smtpHost, smtpPort: Number(smtpPort), useSsl: false },'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-w3-the-form-drops-ssl: THE FORM SENDS NO SSL: THE MAILBOX IS LINKED IN THE CLEAR, WHATEVER WAS TICKED.')
