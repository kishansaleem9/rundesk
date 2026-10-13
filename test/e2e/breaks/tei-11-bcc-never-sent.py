# THE BCC IS IN NO ENVELOPE: IT IS NEVER SENT TO.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "sent from the IMAP mailbox through its own SMTP server, signed in as it over TLS: its people, subject and words, the Bcc in the envelope and in no header; the server’s own mail sent nothing; kept as the task’s email with its Message-ID as the thread, one use taken (read by SQL and from what the server was sent)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap-mailbox.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      await t.sendMail({ envelope: { from: g.address, to: [...mail.to, ...mail.cc, ...mail.bcc] }, raw })\n',
     '      await t.sendMail({ envelope: { from: g.address, to: [...mail.to, ...mail.cc] }, raw })\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-11-bcc-never-sent: THE BCC IS IN NO ENVELOPE: IT IS NEVER SENT TO.')
