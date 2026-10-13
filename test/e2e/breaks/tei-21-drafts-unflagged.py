# A DRAFT IS LEFT UNFLAGGED: A MESSAGE IN DRAFTS NO CLIENT READS AS ONE.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the AI’s draft is left in the IMAP mailbox’s Drafts, flagged a draft, and sent to nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap-mailbox.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      await s.append(drafts.name, ['\\\\Draft', '\\\\Seen'], raw)\n",
     "      await s.append(drafts.name, ['\\\\Seen'], raw)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-21-drafts-unflagged: A DRAFT IS LEFT UNFLAGGED: A MESSAGE IN DRAFTS NO CLIENT READS AS ONE.')
