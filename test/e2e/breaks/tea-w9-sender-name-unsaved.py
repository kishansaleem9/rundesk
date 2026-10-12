# THE SENDER NAME IS NOT SAVED.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "the Email settings list the workspace’s mailboxes to its owner, and the sender name is changed there (read by SQL); Link Gmail goes to Google’s consent asking to send, and a refused consent is said on return"
#
# Save sends who may send, not the name.
import io
p = '/home/user/rundesk/apps/web/src/pages/email-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("api(`/workspaces/${workspaceId}/email-accounts/${account.id}`, { method: 'PATCH', body: { senderName: name, senders } }),",
     "api(`/workspaces/${workspaceId}/email-accounts/${account.id}`, { method: 'PATCH', body: { senders } }),"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-w9-sender-name-unsaved: THE SENDER NAME IS NOT SAVED.')
