# AN IMAP MAILBOX IS ASKED FOR A GRANT IT CANNOT HAVE: NO DRAFT IS WRITTEN IN IT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the AI’s draft is left in the IMAP mailbox’s Drafts, flagged a draft, and sent to nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (a.provider === 'imap') return true\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-22-no-drafts-over-imap: AN IMAP MAILBOX IS ASKED FOR A GRANT IT CANNOT HAVE: NO DRAFT IS WRITTEN IN IT.')
