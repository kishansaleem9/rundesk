# THE SENDER NAME IS THE ADDRESS.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a Gmail is linked through Google’s consent, asked to send and read mail, and comes back to the Email settings — kept as the owner’s, under their name (read by SQL)"
#
# A new mailbox is kept under its address, not its owner’s name.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('.values({ workspaceId: payload.workspaceId, ownerId: payload.userId, provider, address, senderName: name.slice(0, 120), ...grant })',
     '.values({ workspaceId: payload.workspaceId, ownerId: payload.userId, provider, address, senderName: address, ...grant })'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-2-sender-is-the-address: THE SENDER NAME IS THE ADDRESS.')
