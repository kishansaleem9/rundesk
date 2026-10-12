# THE BLIND COPIES ARE DROPPED.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "sent from the Gmail, as the Gmail: its people, subject, words and file went through Google, not the server’s mail; kept as the task’s email with the mailbox and its thread, one use taken (read by SQL)"
#
# Gmail is given no Bcc header, so it sends to nobody blind.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mail-message.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    mail.bcc.length ? `Bcc: ${mail.bcc.join(', ')}` : null,",
     '    null,'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-7-bcc-dropped: THE BLIND COPIES ARE DROPPED.')
