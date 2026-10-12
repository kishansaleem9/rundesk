# A REFUSED CONSENT IS NOT SAID.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "the Email settings list the workspace’s mailboxes to its owner, and the sender name is changed there (read by SQL); Link Gmail goes to Google’s consent asking to send, and a refused consent is said on return"
#
# The provider’s words on return are dropped.
import io
p = '/home/user/rundesk/apps/web/src/pages/email-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      {search.connectError && (',
     '      {false && search.connectError && ('),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-w10-connect-error-unsaid: A REFUSED CONSENT IS NOT SAID.')
