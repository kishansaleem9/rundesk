# LINKED AGAIN, IT IS NOT THE SAME MAILBOX: A SECOND IS MADE BESIDE IT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "when the provider stops taking the password, the next read of the inbox marks the mailbox to link again in the server’s words, and From refuses it (409); linked again with the new password, it is the same mailbox, connected (read by SQL)"
#
# The address is unique in the workspace, so the second is refused by the database (500).
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (existing) {\n      await this.db.update(emailAccounts).set(fields).where(eq(emailAccounts.id, id))\n    } else {',
     "    if (existing && existing.id === 'never') {\n      await this.db.update(emailAccounts).set(fields).where(eq(emailAccounts.id, id))\n    } else {"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-18-linked-again-as-another: LINKED AGAIN, IT IS NOT THE SAME MAILBOX: A SECOND IS MADE BESIDE IT.')
