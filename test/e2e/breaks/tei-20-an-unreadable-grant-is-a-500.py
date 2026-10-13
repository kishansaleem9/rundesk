# A GRANT THAT DOES NOT OPEN IS THROWN AS IT CAME: THE SEND ANSWERS 500.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "a password sealed for another mailbox does not open in this one: the send is refused in words (502, not 500), nothing is sent, and the mailbox is marked to link again (read by SQL)"
#
# `found-13-oct/a-refused-refresh-answers-500`, the one rule a refused Gmail refresh and an IMAP
# password that no longer opens share.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (err instanceof MailboxRefused) throw new BadGatewayException(err.said)\n      throw err\n    }\n  }\n\n  private async markRefused',
     '      throw err\n    }\n  }\n\n  private async markRefused'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-20-an-unreadable-grant-is-a-500: A GRANT THAT DOES NOT OPEN IS THROWN AS IT CAME: THE SEND ANSWERS 500.')
