# THE FROM CHOSEN IS NOT SENT.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "Email opens From the owner’s Gmail, the server’s address offered beside it, the default signature under the words; a template fills the subject and words; Send sends it from the Gmail"
#
# Every email goes from the server’s address.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          accountId: emailFrom && emailFrom !== 'server' ? emailFrom : undefined,",
     '          accountId: undefined,'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-w5-from-ignored: THE FROM CHOSEN IS NOT SENT.')
