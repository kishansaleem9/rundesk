# FROM DOES NOT OFFER THE SERVER’S ADDRESS.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "Email opens From the owner’s Gmail, the server’s address offered beside it, the default signature under the words; a template fills the subject and words; Send sends it from the Gmail"
#
# Only the mailboxes are listed.
import io
p = '/home/user/rundesk/apps/web/src/components/comment-email.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {setup.server && <option value="server">',
     '        {false && setup.server && <option value="server">'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-w1-no-server-from: FROM DOES NOT OFFER THE SERVER’S ADDRESS.')
