# ANYBODY SENDS FROM ANY MAILBOX OF THE WORKSPACE.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "Max, whom the Gmail is not shared with, is refused sending from it (403, in words), and a mailbox of another workspace is none here (404) — nothing sent"
#
# Whom a mailbox is shared with is not asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!granted) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.mayNotSend)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-13-anyone-sends: ANYBODY SENDS FROM ANY MAILBOX OF THE WORKSPACE.')
