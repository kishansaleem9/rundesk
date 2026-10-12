# THE DEFAULT SIGNATURE IS NOT PUT UNDER THE WORDS.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "Email opens From the owner’s Gmail, the server’s address offered beside it, the default signature under the words; a template fills the subject and words; Send sends it from the Gmail"
#
# Email opens with the words as they were.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (sig && !text.includes(sig.body))',
     '    if (false && sig && !text.includes(sig.body))'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-w3-no-signature: THE DEFAULT SIGNATURE IS NOT PUT UNDER THE WORDS.')
